import assert from "node:assert/strict";
import { test } from "node:test";
import { applicationsOpen,validLicence,pricingLevel,allowedPrice,commissionAmount,visibleCells,serviceKey,type PricingPolicy } from "../functions/src/marketplace-policy";
import { workerCanApplyToJob,workerCanWork } from "../utils/jobRules";

const policy:PricingPolicy={recommendedRate:700,unit:"basket",newWorkerMin:700,newWorkerMax:700,establishedMin:525,establishedMax:875,widerPricingUnlockJobs:5,fullPricingUnlockJobs:15};
const initial={rate:700,unit:"basket"};
test("deadlines are independent, fail closed for malformed new data, and allow legacy missing deadlines",()=>{
 const now=Date.parse("2026-09-24T15:00:00Z");assert.equal(applicationsOpen(undefined,now),true);assert.equal(applicationsOpen("2026-09-24T15:00:00Z",now),false);assert.equal(applicationsOpen("2026-09-24T15:00:01Z",now),true);assert.equal(applicationsOpen("invalid",now),false);assert.equal(applicationsOpen({seconds:now/1000},now),false);
});
test("licence approval alone is insufficient; equality and missing expiry are blocked",()=>{
 const now=Date.parse("2026-09-24T00:00:00Z");assert.equal(validLicence("approved",undefined,now),false);assert.equal(validLicence("approved","2026-09-24T00:00:00Z",now),false);assert.equal(validLicence("pending","2030-01-01",now),false);assert.equal(validLicence("verified","2030-01-01",now),true);
});
test("identity gates acceptance and driving additionally needs a valid licence",()=>{
 const worker={verificationStatus:"pending" as const,isLocked:false,outstandingServiceFee:0};assert.equal(workerCanWork(worker).ok,false);
 const verified={...worker,verificationStatus:"approved" as const};assert.equal(workerCanWork(verified).ok,true);
 const job={title:"Boda boda rider",category:"Transport",requiredSkills:[]};assert.equal(workerCanApplyToJob(verified,job).ok,false);assert.equal(workerCanApplyToJob({...verified,driverLicenseVerificationStatus:"approved",driverLicenseExpiryDate:"2099-01-01"},job).ok,true);
});
test("pricing thresholds are service-specific and require account standing for full control",()=>{
 assert.equal(pricingLevel(4,true,policy),1);assert.equal(pricingLevel(5,true,policy),2);assert.equal(pricingLevel(14,true,policy),2);assert.equal(pricingLevel(15,true,policy),3);assert.equal(pricingLevel(15,false,policy),2);
 const serviceCounts={laundry:4,braiding:20};assert.equal(pricingLevel(serviceCounts.laundry,true,policy),1);assert.equal(pricingLevel(serviceCounts.braiding,true,policy),3);
 assert.equal(allowedPrice(701,"basket",4,true,policy,initial),false);assert.equal(allowedPrice(700,"hour",4,true,policy,initial),false);assert.equal(allowedPrice(700,"basket",4,true,policy,initial),true);assert.equal(allowedPrice(875,"basket",5,true,policy,initial),true);assert.equal(allowedPrice(876,"basket",5,true,policy,initial),false);assert.equal(allowedPrice(2000,"hour",15,true,policy,initial),true);assert.equal(allowedPrice(2000,"hour",15,false,policy,initial),false);
});
test("commission uses configured percentage and currency precision",()=>{assert.equal(commissionAmount(1000,0.01),10);assert.equal(commissionAmount(1234.56,0.01),12.35);assert.equal(commissionAmount(1000,0.02),20);assert.equal(commissionAmount(-5,0.01),0);assert.equal(commissionAmount(1000,NaN),0);});
test("map bounds always request a bounded coarse grid",()=>{for(const bounds of [[36.7,-1.4,37,-1.1],[-180,-80,180,80],[33,-5,42,5]] as const){const result=visibleCells(bounds[0],bounds[1],bounds[2],bounds[3]);assert.ok(result.cells.length<=180);assert.ok(result.size>=0.02);assert.equal(new Set(result.cells.map(cell=>cell.id)).size,result.cells.length);}assert.throws(()=>visibleCells(40,2,35,3));assert.throws(()=>visibleCells(NaN,0,1,1));});
test("service IDs prevent duplicate names differing only in case or whitespace",()=>{assert.equal(serviceKey(" Laundry  helper "),serviceKey("laundry helper"));assert.ok(!serviceKey("A/B.C").includes("/"));assert.ok(!serviceKey("A/B.C").includes("."));});
