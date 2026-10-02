import test from "node:test";
import assert from "node:assert/strict";
import { FARM, landBounds } from "../src/config/crops.js";
import { newFarm, paintSoil, plant, harvest, placeSprinkler } from "../src/game/farm.js";
import { createWorld } from "../src/render/world.js";

function mockBabylon() {
  const meshes=[],nodes=[],textures=[];
  function node(name,dimensions={}) {
    const item={
      name,dimensions,enabled:true,isPickable:true,parent:null,
      position:{x:0,y:0,z:0,set(x,y,z){Object.assign(this,{x,y,z})}},
      scaling:{x:1,y:1,z:1,set(x,y,z){Object.assign(this,{x,y,z})},setAll(value){this.x=this.y=this.z=value}},
      rotation:{x:0,y:0,z:0},
      setEnabled(enabled){this.enabled=enabled},
      dispose(){this.disposed=true},
    };
    nodes.push(item);
    return item;
  }
  class Color3 {
    constructor(){}
    static FromHexString(hex){return {hex}}
  }
  class DynamicTexture {
    constructor(name){this.name=name;this.updates=0;this.clears=0;textures.push(this)}
    getContext(){
      const self=this;
      return {
        createRadialGradient(){return {addColorStop(){}}},
        fillRect(){},clearRect(){self.clears++},save(){},restore(){},
        translate(){},scale(){},beginPath(){},arc(){},fill(){},
        moveTo(){},lineTo(){},stroke(){},
      };
    }
    update(){this.updates++}
  }
  const builder={
    CreateBox(name,dimensions){const mesh=node(name,dimensions);meshes.push(mesh);return mesh},
    CreateCylinder(name,dimensions){const mesh=node(name,dimensions);meshes.push(mesh);return mesh},
    CreateSphere(name,dimensions){const mesh=node(name,dimensions);meshes.push(mesh);return mesh},
    CreateGround(name,dimensions){const mesh=node(name,dimensions);meshes.push(mesh);return mesh},
  };
  return {
    meshes,nodes,textures,
    BABYLON:{
      Color3,DynamicTexture,
      StandardMaterial:class {constructor(name){this.name=name}},
      TransformNode:class {constructor(name){return node(name)}},
      MeshBuilder:builder,
      Mesh:{MergeMeshes(list){const merged=node("merged crop");meshes.push(merged);return merged}},
    },
  };
}
test("one continuous ground and one shared painted-soil surface replace all tile meshes",()=>{
  const prev=globalThis.BABYLON,mock=mockBabylon();
  globalThis.BABYLON=mock.BABYLON;
  try {
    const world=createWorld({});
    assert.deepEqual(mock.meshes.map(m=>m.name),
      ["continuous farm ground","owned farm surface","continuous painted soil","round soil brush"]);
    assert.equal(world.ground.metadata.farmSurface,true);
    assert.equal(world.soilSurface.isPickable,false);
    assert.equal(mock.meshes.filter(mesh=>mesh.isPickable).length,1);
    world.setHover({x:-3.125,z:-.5});
    const marker=mock.meshes.find(mesh=>mesh.name==="round soil brush");
    assert.equal(marker.enabled,true);
    assert.equal(marker.position.x,-3.125);
    world.setHover(null);
    assert.equal(marker.enabled,false);
  } finally {
    globalThis.BABYLON=prev;
  }
});
test("continuous paint updates a single reusable texture, not meshes per dab",()=>{
  const prev=globalThis.BABYLON,mock=mockBabylon();
  globalThis.BABYLON=mock.BABYLON;
  try {
    const world=createWorld({}),initial=newFarm();
    world.updateLand(initial.landLevel);
    world.syncSoil(initial.soil);
    assert.equal(world.drawnSoil.length,4);
    const soilTexture=mock.textures.find(texture=>texture.name==="painted soil canvas");
    assert.equal(soilTexture.updates,1);
    assert.equal(mock.meshes.length,4);
    world.syncSoil(initial.soil);
    assert.equal(soilTexture.updates,1);
    const stroke=paintSoil({...initial,coins:200},{x:-4.2,z:-.7},{x:-1.7,z:-.7});
    assert.equal(stroke.ok,true);
    world.syncSoil(stroke.state.soil);
    assert.equal(world.drawnSoil.length,stroke.state.soil.length);
    assert.equal(mock.meshes.length,4);
    assert.equal(soilTexture.updates,2);
    const owned=mock.meshes.find(mesh=>mesh.name==="owned farm surface");
    assert.equal(owned.scaling.z,
      (landBounds(FARM.initialLevel).maxZ-FARM.minZ)/(landBounds(FARM.maxLevel).maxZ-FARM.minZ));
    world.updateLand(3);
    assert.equal(owned.scaling.z,
      (landBounds(3).maxZ-FARM.minZ)/(landBounds(FARM.maxLevel).maxZ-FARM.minZ));
    world.syncSoil(initial.soil);
    assert.equal(world.drawnSoil.length,4);
    assert.equal(soilTexture.clears,1);
    assert.equal(mock.meshes.filter(mesh=>mesh.isPickable).length,1);
    for (const method of ["setHover","updateLand","syncSoil","syncEntities",
      "playWatering","playSprinklerWatering","animate"])
      assert.equal(typeof world[method],"function");
  } finally { globalThis.BABYLON=prev; }
});
test("crop and sprinkler models follow independent positions; harvesting leaves soil visible",()=>{
  const prev=globalThis.BABYLON,mock=mockBabylon();
  globalThis.BABYLON=mock.BABYLON;
  try {
    const world=createWorld({});
    let farm={...newFarm(),inventory:{wheat:10,sprinkler:1}};
    farm=plant(farm,{x:-8.3,z:-3.3},"wheat",1000).state;
    farm=placeSprinkler(farm,{x:-6.4,z:-3.5},1000).state;
    world.syncSoil(farm.soil);
    world.syncEntities(farm.plants,farm.sprinklers,2000);
    assert.equal(world.plantViews.length,1);
    assert.equal(world.sprinklerViews.length,1);
    assert.equal(world.plantViews[0].x,-8.3);
    assert.equal(world.sprinklerViews[0].x,-6.4);
    const originalPlant=world.plantViews[0].root;
    const soilCount=world.drawnSoil.length;
    world.animate(3000);
    world.playWatering(0);
    world.playSprinklerWatering(0,0);
    const gathered=harvest(farm,0,90000);
    world.syncEntities(gathered.state.plants,gathered.state.sprinklers,90000);
    assert.equal(world.plantViews.length,0);
    assert.equal(originalPlant.disposed,true);
    assert.equal(world.sprinklerViews.length,1);
    assert.equal(world.drawnSoil.length,soilCount);
  } finally { globalThis.BABYLON=prev; }
});
