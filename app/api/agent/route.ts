import { createHash } from "node:crypto";
import { requireServerUser } from "@/lib/server-auth";
import { adminDb } from "@/lib/firebase-admin";
import { resolveService,MarketplaceError,validId } from "@/lib/marketplace-server";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest,NextResponse } from "next/server";
export async function GET(request:NextRequest){
  try{const user=await requireServerUser(request),db=adminDb();if(!user.profile.agentEnabled)return NextResponse.json({enabled:false});
    const view=request.nextUrl.searchParams.get("view")??"overview",cursor=request.nextUrl.searchParams.get("cursor");
    if(view==="referrals"||view==="earnings"){
      const collection=view==="referrals"?"agentReferrals":"commissionLedger";
      let query=db.collection(collection).where("agentId","==",user.uid).orderBy("__name__").limit(31);if(cursor)query=query.startAfter(validId(cursor));
      const records=await query.get();const docs=records.docs.slice(0,30);
      const states=view==="earnings"&&docs.length?await db.getAll(...docs.map(doc=>db.doc(`commissionStates/${doc.id}`))):[];
      return NextResponse.json({enabled:true,records:docs.map((doc,i)=>({id:doc.id,...doc.data(),...(states[i]?.data()??{})})),nextCursor:records.size>30?docs[29].id:null});
    }
    const [metrics,links,referrals]=await Promise.all([db.doc(`agentMetrics/${user.uid}`).get(),db.collection("agentLinks").where("agentId","==",user.uid).limit(50).get(),db.collection("agentReferrals").where("agentId","==",user.uid).count().get()]);
    return NextResponse.json({enabled:true,metrics:{...metrics.data(),peopleReferred:referrals.data().count},links:links.docs.map(doc=>({id:doc.id,...doc.data()}))});
  }catch(error){return failure(error);}
}
export async function POST(request:NextRequest){
  try{const user=await requireServerUser(request),body=await request.json(),db=adminDb();
    if(body.action==="register"){
      await db.runTransaction(async tx=>{const ref=db.doc(`users/${user.uid}`),snapshot=await tx.get(ref);if(snapshot.data()?.isLocked||snapshot.data()?.role==="admin")throw new MarketplaceError("This account cannot become an agent.",403);tx.update(ref,{agentEnabled:true,agentSince:snapshot.data()?.agentSince??FieldValue.serverTimestamp()});});
      return NextResponse.json({success:true});
    }
    if(!user.profile.agentEnabled||user.profile.isLocked)throw new MarketplaceError("Active agent access required.",403);
    if(body.action!=="create_link")throw new MarketplaceError("Unknown agent action.");
    const service=body.service?await resolveService(String(body.service)):null;
    const key=service?service.serviceId:"general";
    // Deterministic owner+service link prevents unlimited duplicate links.
    const ref=db.collection("agentLinks").doc(createHash("sha256").update(`${user.uid}:${key}`).digest("hex").slice(0,40));
    await db.runTransaction(async tx=>{const existing=await tx.get(ref);if(!existing.exists)tx.create(ref,{agentId:user.uid,sourceType:"agent_referral",name:service?`Join COPIC as a ${service.service} worker`:"Join COPIC",...(service??{}),active:true,createdAt:FieldValue.serverTimestamp()});});
    return NextResponse.json({id:ref.id,url:`/join/${ref.id}`});
  }catch(error){return failure(error);}
}
function failure(error:unknown){return NextResponse.json({error:error instanceof Error?error.message:"Agent request failed."},{status:error instanceof MarketplaceError?error.status:400});}
