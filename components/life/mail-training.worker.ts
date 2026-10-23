import type {MailboxAccount} from "@/lib/life";
import {trainPersonalModel,type TrainingExample} from "@/lib/mail-learning";
const worker=globalThis as unknown as {onmessage:((event:MessageEvent<{examples:TrainingExample[];account:MailboxAccount}>)=>void)|null;postMessage:(value:unknown)=>void};
worker.onmessage=event=>{try{worker.postMessage({model:trainPersonalModel(event.data.examples,event.data.account)});}catch(error){worker.postMessage({error:error instanceof Error?error.message:"Training failed."});}};
