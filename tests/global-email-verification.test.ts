import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { validSignupEmail } from "../utils/email-validation";
const require = createRequire(resolve("package.json"));
async function load(entry: string, mocks: Record<string, unknown>, browser: Record<string, unknown> = {}) {
  const result = await build({ absWorkingDir: process.cwd(), tsconfig: resolve("tsconfig.json"), entryPoints: [resolve(entry)], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "boundaries", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path === "server-only" || args.path in mocks ? { path: args.path, namespace: "mock" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: `module.exports = mocks[${JSON.stringify(args.path)}] || {};`, loader: "js" }));
  } }] });
  const loaded = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module: loaded, exports: loaded.exports, require, mocks, console, process, Buffer, URL, URLSearchParams, ...browser });
  return loaded.exports as Record<string, (...args: any[]) => any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function storage() {
 const values = new Map<string,string>();
 return { getItem: (key:string) => values.get(key) ?? null, setItem: (key:string,value:string) => values.set(key,value), removeItem: (key:string) => values.delete(key) };
}
test("email syntax rejects incomplete addresses before account creation", () => {
 for(const email of ["john@", "john@gmail", "@domain.com", "a@@b.com", "a b@c.com"]) assert.equal(validSignupEmail(email), false);
 for(const email of ["worker@example.com", "client+work@example.co.ke"]) assert.equal(validSignupEmail(email), true);
});
test("global intent supports roles, protected routes and recruitment without accepting unsafe redirects", async () => {
 const browser = { location: { search:"" }, sessionStorage:storage(), localStorage:storage() };
 const paths = await load("utils/verification-return.ts", {}, {window:browser});
 for(const path of ["/complete-profile?role=worker","/complete-profile?role=client","/profile","/jobs/job-1","/admin/agent-program","/become-agent","/join/agent-1","/recruit/campaign-1"]) {
  paths.rememberVerificationReturn(path);
  browser.sessionStorage=storage();
  assert.equal(paths.verificationReturnPath(), path);
  assert.equal(paths.verificationPath(path), "/verify-email?returnTo="+encodeURIComponent(path));
  paths.clearVerificationReturn();
 }
 for(const value of ["https://evil.test","//evil.test","javascript:alert(1)","/\\evil.test","/jobs/../admin","/jobs/%2f%2fevil","/join/x?rate=1","/verify-email","/profile\n","/complete-profile?role=admin"]) assert.equal(paths.safeVerificationPath(value),null);
 browser.location.search="?role=client";
 assert.equal(paths.verificationReturnPath(),"/complete-profile?role=client");
});
test("server guard uses fresh Firebase state even with a forged verified token/profile mirror", async () => {
 let verified=false, disabled=false;
 const guard=await load("lib/verified-auth.ts",{"@/lib/firebase-admin":{adminAuth:()=>({
  verifyIdToken:async (token:string,revoked:boolean)=>{assert.equal(revoked,true); if(token!=="valid")throw new Error("invalid token");return {uid:"person",email_verified:true};},
  getUser:async()=>({emailVerified:verified,disabled,email:"person@example.com"})
 })}});
 await assert.rejects(guard.verifyVerifiedIdToken("valid"), /EMAIL_NOT_VERIFIED/);
 verified=true;
 assert.equal((await guard.verifyVerifiedIdToken("valid")).email_verified,true);
 disabled=true;
 await assert.rejects(guard.verifyVerifiedIdToken("valid"), /EMAIL_NOT_VERIFIED/);
 await assert.rejects(guard.verifyVerifiedIdToken("forged"), /invalid token/);
});
test("unverified accounts cannot mutate protected APIs or complete any profile, even with browser verification flags", async () => {
 const mocks={"@/lib/firebase-admin":{adminAuth:()=>({
   verifyIdToken:async()=>({uid:"person",email_verified:true}),getUser:async()=>({emailVerified:false,disabled:false})
 }),adminDb:()=>{throw new Error("Database must not be accessed before verification");}},
 "@/lib/local-sql":{}, "@/lib/data-backend":{isSqlBackend:()=>false, shouldUseFirebase:()=>true,logDataMode:()=>undefined}};
 for(const [file,method] of [
 ["app/api/auth/create-profile/route.ts","POST"],["app/api/auth/me/route.ts","POST"],
 ["app/api/profile/skills/route.ts","POST"],["app/api/profile/photo/route.ts","PATCH"],
 ["app/api/profile/location/route.ts","PATCH"],["app/api/account-settings/route.ts","PATCH"],
 ["app/api/agent/route.ts","POST"],["app/api/jobs/create/route.ts","POST"],
 ["app/api/applications/route.ts","POST"],["app/api/hire-requests/route.ts","POST"],
 ["app/api/chat/route.ts","GET"],["app/api/notifications/route.ts","GET"],
 ["app/api/service-fee/payments/route.ts","GET"],["app/api/kyc/start/route.ts","GET"],
 ["app/api/reports/route.ts","POST"],["app/api/ratings/route.ts","POST"]
 ]) {
   const route=await load(file,file === "app/api/auth/me/route.ts" ? {...mocks,"@/lib/data-backend":{isSqlBackend:()=>true}} : mocks);
   const request=new NextRequest("https://copic.example/api/test",{method,headers:{Authorization:"Bearer valid","Content-Type":"application/json"},...(method==="GET"?{}:{body:JSON.stringify({role:"worker",action:"register",emailVerified:true,isAgent:true,jobId:"job"})})});
   const response=await route[method](request);
   assert.equal(response.status,403,file);
   assert.equal((await response.json()).error,"EMAIL_NOT_VERIFIED",file);
 }
});
test("signup never sends OTPs or deletes newly created accounts when link delivery is unavailable", async () => {
 let creates=0, deletes=0, sends=0;
 const user={uid:"person",emailVerified:false};
 const service=await load("services/auth.ts",{
 "@/lib/firebase":{requireAuth:()=>({})},
 "firebase/auth":{createUserWithEmailAndPassword:async()=>{creates++;return {user};},updateProfile:async()=>undefined,deleteUser:async()=>{deletes++;}},
 "firebase/firestore":{}
 },{fetch:async()=>{sends++;throw new Error("offline");}});
 await assert.rejects(service.registerWithEmail("john@gmail","password","John"),/valid email/);
 assert.equal(creates,0);
 assert.equal(await service.registerWithEmail("john@example.com","password","John"),user);
 assert.equal(creates,1);assert.equal(deletes,0);assert.equal(sends,0);
});
test("verification-send errors distinguish syntax, rate limit, network and unknown failures", async()=>{
 const service=await load("services/emailVerification.ts",{"@/lib/firebase":{},"firebase/auth":{}});
 assert.equal(service.verificationSendError({code:"auth/invalid-email"}),"Enter a valid email address.");
 assert.match(service.verificationSendError({code:"auth/too-many-requests"}),/Too many/);
 assert.match(service.verificationSendError({code:"auth/network-request-failed"}),/connection problem/);
 assert.equal(service.verificationSendError({code:"unknown"}),"We couldn't send the verification email. Check your email address and try again.");
});
test("legacy OTP endpoints cannot create profiles or set a verified flag",async()=>{
 for(const name of ["send-email-otp","verify-email-otp"]) {
  const route=await load("app/api/auth/"+name+"/route.ts",{});
  assert.equal((await route.POST()).status,410);
 }
});
test("direct Firebase access rules use signed Auth claims, not mutable profile flags",()=>{
 const rules=readFileSync("firestore.rules","utf8");
 const storageRules=readFileSync("storage.rules","utf8");
 assert.match(rules,/request.auth.token.email_verified == true/);
 assert.doesNotMatch(rules,/data.emailVerified == true/);
 assert.match(storageRules,/request.auth.token.email_verified == true/);
});

test("Admin bootstrap verifies mailbox access before granting claims, profile or Admin session", async () => {
 let created = false;
 const writes: string[] = [];
 const auth = {
  getUserByEmail: async () => { throw Object.assign(new Error("not found"), {code:"auth/user-not-found"}); },
  createUser: async (input: {emailVerified:boolean}) => { assert.equal(input.emailVerified,false); created=true; return {uid:"new-admin",emailVerified:false}; },
  createCustomToken: async (uid:string, claims?:object) => { assert.equal(uid,"new-admin"); assert.equal(claims,undefined); return "verification-only-session"; },
  setCustomUserClaims: async () => { throw new Error("Must not grant Admin claims"); }
 };
 const query = {where:()=>query,limit:()=>query,get:async()=>({docs:[]}),doc:()=>({set:async()=>{writes.push("attempt");}})};
 const route=await load("app/api/auth/admin-login/route.ts",{
  "@/lib/firebase-admin":{adminAuth:()=>auth,adminDb:()=>({collection:(name:string)=>{assert.equal(name,"admin_login_attempts");return query;}})},
  "@/lib/admin-credentials":{adminPasswordMatches:async()=>true},
  "@/lib/data-backend":{isSqlBackend:()=>false},"@/lib/local-sql":{}
 },{crypto:{randomUUID:()=>"test-attempt"},process:{env:{NODE_ENV:"production",ADMIN_USERNAME:"admin",ADMIN_PASSWORD:"fixture-only",ADMIN_EMAIL:"admin@example.test"}}});
 const response=await route.POST(new NextRequest("https://copic.example/api/auth/admin-login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:"admin",password:"fixture-only"})}));
 assert.equal(response.status,200);assert.equal(created,true);
 assert.equal((await response.json()).requiresEmailVerification,true);
 assert.deepEqual(writes,["attempt"]);
});

test("changing account email clears verification and revokes old sessions while preserving the profile", async () => {
 let revoked=false;
 let update: Record<string,unknown>={};
 let stored: Record<string,unknown>={role:"worker",jobs:7};
 const route=await load("app/api/account-settings/route.ts",{
  "@/lib/firebase-admin":{
   adminAuth:()=>({verifyIdToken:async()=>({uid:"person"}),getUser:async()=>({email:"old@example.test",emailVerified:true}),
    updateUser:async(_uid:string,value:Record<string,unknown>)=>{update=value;},revokeRefreshTokens:async()=>{revoked=true;}}),
   adminDb:()=>({collection:()=>({doc:()=>({set:async(value:Record<string,unknown>)=>{stored={...stored,...value};},get:async()=>({id:"person",data:()=>stored})})})})
  },
  "@/lib/data-backend":{isSqlBackend:()=>false},"@/lib/local-sql":{}
 });
 const response=await route.PATCH(new NextRequest("https://copic.example/api/account-settings",{method:"PATCH",headers:{Authorization:"Bearer test","Content-Type":"application/json"},body:JSON.stringify({email:"new@example.test"})}));
 assert.equal(response.status,200);assert.equal((await response.json()).requiresEmailVerification,true);
 assert.equal(update.emailVerified,false);assert.equal(stored.emailVerified,false);assert.equal(stored.jobs,7);assert.equal(revoked,true);
});
