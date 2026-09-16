import assert from "node:assert/strict";
import { FieldValue,type Firestore } from "firebase-admin/firestore";
type Data=Record<string,unknown>;
class Ref { constructor(public path:string){} get id(){return this.path.split("/").at(-1)!;} }
class Query { constructor(public path:string,public filters:Array<[string,unknown]>=[]){ } where(key:string,operator:string,value:unknown){assert.equal(operator,"==");return new Query(this.path,[...this.filters,[key,value]]);} }
function merge(old:Data,patch:Data):Data {
 const result={...old};for(const [key,value]of Object.entries(patch)){
  if(value instanceof FieldValue){ if(value.isEqual(FieldValue.serverTimestamp()))result[key]=new Date();else {assert.ok("operand" in value);result[key]=Number(old[key]??0)+Number((value as unknown as {operand:number}).operand);} }
  else if(value&&typeof value==="object"&&!Array.isArray(value)&&!(value instanceof Date))result[key]=merge((old[key]??{}) as Data,value as Data);
  else result[key]=value;
 }return result;
}
/** Transaction test double: stages writes atomically and rejects reads after writes. */
export class MemoryFirestore {
 records=new Map<string,Data>();
 doc(path:string){return new Ref(path);}
 collection(path:string){return new Query(path);}
 seed(path:string,data:Data){this.records.set(path,data);return this;}
 snapshot(ref:Ref){return {id:ref.id,exists:this.records.has(ref.path),data:()=>this.records.get(ref.path)};}
 async runTransaction<T>(callback:(tx:{get:(ref:Ref|Query)=>Promise<unknown>;set:(ref:Ref,data:Data,options?:{merge?:boolean})=>void;create:(ref:Ref,data:Data)=>void;update:(ref:Ref,data:Data)=>void})=>Promise<T>){
  const writes:Array<()=>void>=[];
  const tx={get:async(ref:Ref|Query)=>{assert.equal(writes.length,0,"Firestore requires all reads before writes");if(ref instanceof Query)return {docs:[...this.records.keys()].filter(path=>path.startsWith(ref.path+"/")&&ref.filters.every(([key,value])=>this.records.get(path)?.[key]===value)).map(path=>this.snapshot(new Ref(path)))};return this.snapshot(ref);},set:(ref:Ref,data:Data,options?:{merge?:boolean})=>{writes.push(()=>this.records.set(ref.path,merge(options?.merge?this.records.get(ref.path)??{}:{},data)));},create:(ref:Ref,data:Data)=>{writes.push(()=>{assert.equal(this.records.has(ref.path),false,"create must not overwrite immutable record");this.records.set(ref.path,merge({},data));});},update:(ref:Ref,data:Data)=>{writes.push(()=>{assert.ok(this.records.has(ref.path));this.records.set(ref.path,merge(this.records.get(ref.path)!,data));});}};
  const result=await callback(tx);for(const write of writes)write();return result;
 }
 asFirestore(){return this as unknown as Firestore;}
}
