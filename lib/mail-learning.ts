import type {MailboxAccount} from "./life";
export const mailGroups = [
  {id:"shopping",label:"Promotion / shopping",detail:"Offers, orders, receipts and products"},
  {id:"jobs",label:"Jobs",detail:"Applications, recruiting and career opportunities"},
  {id:"school",label:"School",detail:"Classes, coursework and university updates"},
  {id:"other",label:"Other / random",detail:"Personal messages and everything else"},
] as const;
export const mainMailAccount:MailboxAccount="victorhui94@gmail.com";
export type MailGroup = "shopping"|"jobs"|"school"|"other"|"work"|"general"|"spons"|"me";
export type MailCategory={id:MailGroup;label:string;detail:string;description:string};
export function groupsForAccount(account?:string):MailCategory[]{
 if(account==="huiv@berkeley.edu")return [
  {id:"school",label:"School",detail:"Classes, coursework and university updates",description:"school, university courses, assignments or academic administration"},
  {id:"jobs",label:"Job",detail:"Applications, recruiting and career opportunities",description:"job applications, recruitment, interviews or career opportunities"},
  {id:"work",label:"Work",detail:"Current work, coworkers, projects and workplace updates",description:"current employment or internship work, coworkers, manager requests, workplace meetings, project updates, timesheets, payroll or employee surveys; not job applications or recruitment"},
  {id:"other",label:"Random",detail:"Personal messages and everything outside school, jobs or work",description:"personal messages, shopping, account notifications, news or miscellaneous topics unrelated to school, recruiting or current employment"},
 ];
 if(account==="vhui@hackberkeley.org")return [
  {id:"general",label:"General",detail:"Cal Hacks team, event and organization updates",description:"general Cal Hacks organization, hackathon event planning, team announcements or operational updates"},
  {id:"spons",label:"Spons",detail:"Sponsors, partnerships, funding and company outreach",description:"hackathon sponsorship, corporate partnerships, sponsor outreach, funding, sponsor contracts or sponsorship benefits"},
  {id:"me",label:"Me",detail:"Personal messages and requests specifically for Victor",description:"personal correspondence or a direct individual request specifically for Victor Hui, unrelated to sponsorship or general team announcements"},
 ];
 return mailGroups.map((group,i)=>({...group,description:["shopping, sales promotions, purchases, orders or receipts","job applications, recruitment, interviews or career opportunities","school, university courses, assignments or academic administration","personal correspondence, account notifications, news or other miscellaneous topics"][i]}));
}
export function validGroup(account:string,label:string):label is MailGroup{return groupsForAccount(account).some(group=>group.id===label);}
export const groupIds=(account?:string)=>groupsForAccount(account).map(group=>group.id);
export type MailFeatures = {sender:string;subject:string;summary:string};
export type TrainingExample = MailFeatures & {key:string;label:MailGroup};
export type MailPrediction = {label:MailGroup;score:number;scores:number[];method:"starter"|"personal"|"semantic"|"reviewed"|"ensemble";votes?:{model:string;label:MailGroup;scores:number[]}[];agreement?:number;needsReview?:boolean};
export type PersonalModel = {version:1|2;account?:MailboxAccount;categories?:MailGroup[];vocabulary:string[];idf:number[];weights:number[][];bias:number[];trainedAt:string;examples:number;labelFingerprint:string;metrics:Evaluation|null};
export type Evaluation = {samples:number;accuracy:number;macroF1:number;matrix:number[][];support:number[];trainGroups:number;testGroups:number};
export const semanticModel = {id:"Xenova/nli-deberta-v3-xsmall",revision:"2a4f614a701367a02d51389039afc998faeda637",tag:"deberta-xsmall-v1",url:"https://huggingface.co/Xenova/nli-deberta-v3-xsmall"};
const seeds:Record<"shopping"|"jobs"|"school"|"other",string[]>={
 shopping:["Shop our new collection and save twenty percent with this discount code","Your order has shipped with tracking and delivery details","Thank you for your purchase here is your store receipt","A sale on shoes clothing and fashion ends tonight","Amazon your package has been delivered order confirmation","Your return and refund for your online order is complete","Exclusive offer buy one get one free limited time sale","New products and seasonal deals from your favorite brand","Your shopping cart is waiting checkout and free shipping","Tickets are on sale buy now for our next concert","New restaurant menu order food delivery with a coupon","Your subscription payment receipt and renewal for a retail service","Travel deals book a hotel or flight for less","The sale you have been waiting for starts today","Your online order has been cancelled and refunded","Member discount for our store anniversary shop today"],
 jobs:["Thank you for applying for the software engineering internship","Your application status for the new graduate role has changed","We would like to schedule a technical interview with our hiring team","A recruiter has reached out about a data scientist job opportunity","New jobs matching your preferences on LinkedIn and Indeed","Your offer letter and employment start date are ready","We regret to inform you we are moving forward with other candidates","Complete your coding assessment for this engineering position","Career fair employers and open internship positions","Software engineer jobs and companies hiring this week","Interview feedback and next steps for your candidacy","A referral invitation to join our company recruitment process","Handshake campus recruiting and summer internships","Your job application was submitted successfully","An opportunity for a full stack developer on our team","Salary and benefits for your new job offer"],
 school:["Your homework assignment and problem set are due tomorrow","The professor posted lecture notes for your course","bCourses Canvas assignment submission grade has been updated","Class discussion section and lab schedule for this semester","Your university enrollment and course registration appointment","Financial aid tuition and student billing information","An academic advisor has updated your degree requirements","A new announcement from your instructor about the midterm exam","Campus library and student services hours this week","School syllabus final exam room and class project details","Your teaching assistant has graded your quiz submission","CalCentral student course waitlist and enrollment update","University lecture cancelled office hours rescheduled","Your class group assignment and research seminar reading","Campus housing move in and residence hall information","A reminder to complete your university student requirements"],
 other:["Your account password was changed and a new login was detected","Your bank statement and account balance are available","A friend sent you a personal message about dinner","Your calendar event invitation and meeting reminder","A security alert for your email account two factor authentication","Your medical appointment has been confirmed","Your monthly utility bill is ready to view","A family photo and weekend plans for our trip","GitHub repository notification pull request and build status","A reminder about your insurance policy documents","Your verification code for signing in to your account","Thanks for the meeting here are the notes we discussed","Your cloud storage is almost full manage your files","A package from a friend and a personal thank you note","A newsletter about news science and world events","Your gym reservation and upcoming personal schedule"],
};
const calHacksSeeds:Record<"general"|"spons"|"me",string[]>={
 general:["Cal Hacks team all hands meeting and event planning agenda","An announcement to all organizers about the hackathon schedule","Volunteer coordination and event operations update for the team","Hackathon registration participant logistics and venue information","Weekly organizer newsletter general updates for Cal Hacks","Judges mentors and workshop schedule for the event","Team planning document and general meeting minutes","Hackathon application launch announcement for all staff","Event check in food and transportation logistics","An update about our hackathon website and organization calendar","Cal Hacks organizer onboarding and team resources","A campus event invitation and organization announcement"],
 spons:["Company sponsorship proposal and hackathon partner opportunities","Following up on our sponsor outreach and partnership discussion","Corporate sponsor benefits booth placement and recruiting package","Sponsorship invoice payment and company funding confirmation","A company would like to sponsor Cal Hacks this year","Sponsor contract memorandum and partnership agreement","Our sponsorship tiers and benefits for company partners","Funding request for a hackathon corporate partnership","Sponsor representative meeting to discuss the sponsorship package","Company outreach for hackathon sponsorship and financial support","Sponsor booth logistics for our corporate partner team","Renewing our company partnership and sponsorship commitment"],
 me:["Hi Victor can you personally review this draft and let me know","Victor Hui your individual access request has been approved","A personal message for Victor about his availability","Victor could you send me your own bio and headshot","Your personal appointment has been confirmed Victor","An individual reminder for Victor to complete his own form","Hey Victor are you free for a quick one on one chat","Victor your account password and verification code","A personal thank you note addressed specifically to Victor Hui","Victor can you reply with your personal preference for this","A direct individual request for Victor to sign his own document","A private conversation about Victor's schedule and personal plans"],
};
const workSeeds = [
 "Your manager shared this week's project priorities and deliverables",
 "Team standup meeting agenda and workplace project updates",
 "Please complete the employee pulse survey for our department",
 "Submit your timesheet for this week's work hours",
 "Your payroll pay stub and employee compensation statement are ready",
 "A coworker shared the weekly sprint planning document",
 "Your supervisor requested a status report on the work project",
 "Employee training and workplace compliance reminder",
 "Work shift schedule and staffing changes for next week",
 "Team retrospective meeting and action items for our project",
 "Your manager approved your time off request",
 "Internal company announcement for current employees",
 "Please review your colleague's project dashboard before our team meeting",
 "Your internship supervisor assigned this week's work tasks",
 "Work Pulse Survey Topics Dashboard weekly check in",
 "Department staff meeting and employee operations update",
];
export const semanticTag=(account?:string)=>account==="huiv@berkeley.edu"?`${semanticModel.tag}:berk-v3`:account==="vhui@hackberkeley.org"?`${semanticModel.tag}:cal-hacks-v2`:semanticModel.tag;
export function examplesForAccount(account:MailboxAccount=mainMailAccount):TrainingExample[]{
 if(account==="vhui@hackberkeley.org")return Object.entries(calHacksSeeds).flatMap(([label,rows])=>rows.map((subject,i)=>({key:`starter:${label}:${i}`,label:label as MailGroup,sender:"",subject,summary:""})));
 if(account==="huiv@berkeley.edu")return ["school","jobs","work","other"].flatMap(category=>[...(category==="work"?workSeeds:seeds[category as keyof typeof seeds]),...(category==="other"?seeds.shopping:[])].map((subject,i)=>({key:`starter:${category}:${i}`,label:category as MailGroup,sender:"",subject,summary:""})));
 return starterExamples;
}
export const categoriesForModel=(model:PersonalModel)=>model.categories||groupIds(model.account);
export const starterExamples:TrainingExample[]=mailGroups.flatMap(group=>seeds[group.id].map((text,index)=>({key:`starter:${group.id}:${index}`,label:group.id,sender:"",subject:text,summary:""})));
const hash=(text:string)=>{let value=2166136261;for(let i=0;i<text.length;i++)value=Math.imul(value^text.charCodeAt(i),16777619);return (value>>>0).toString(16);};
export function mailFeatureFingerprint(mail:MailFeatures){return hash(JSON.stringify([mail.sender,mail.subject,mail.summary]));}
export function labelFingerprint(examples:TrainingExample[]){return hash(JSON.stringify([...examples].sort((a,b)=>a.key.localeCompare(b.key)).map(example=>[example.key,example.label,mailFeatureFingerprint(example)])));}
export const featuresOf=(mail:MailFeatures):MailFeatures=>({sender:mail.sender,subject:mail.subject,summary:mail.summary});
export function mailModelText(mail:MailFeatures){return `Subject: ${mail.subject}\nFrom: ${mail.sender}\n${mail.summary}`.slice(0,2000);}
const stopWords=new Set(["the","and","for","you","your","this","that","with","from","have","has","are","was","will","our","www","com","https"]);
function tokens(mail:MailFeatures){
 const words=`${mail.subject} ${mail.subject} ${mail.summary}`.toLowerCase().replace(/https?:\/\/\S+/g," ").match(/[a-z][a-z']{1,30}/g)||[];
 const filtered=words.filter(word=>!stopWords.has(word));
 const output=[...filtered,...filtered.slice(1).map((word,i)=>`${filtered[i]}_${word}`)];
 const domain=mail.sender.match(/@([a-z0-9.-]+)/i)?.[1];if(domain)output.push(`sender:${domain.toLowerCase()}`);
 return output;
}
function vector(mail:MailFeatures,model:Pick<PersonalModel,"vocabulary"|"idf">,index:Map<string,number>){
 const counts=new Map<number,number>();for(const token of tokens(mail)){const key=index.get(token);if(key!==undefined)counts.set(key,(counts.get(key)||0)+1);}
 const entries=[...counts].map(([i,count])=>[i,(1+Math.log(count))*model.idf[i]] as const),norm=Math.sqrt(entries.reduce((sum,[,weight])=>sum+weight*weight,0))||1;
 return entries.map(([i,weight])=>[i,weight/norm] as const);
}
const softmax=(values:number[])=>{const max=Math.max(...values),exps=values.map(value=>Math.exp(value-max)),total=exps.reduce((a,b)=>a+b,0);return exps.map(value=>value/total);};
function fit(examples:TrainingExample[],personalCount:number,account:MailboxAccount=mainMailAccount):PersonalModel{
 const categories=groupIds(account);
 const df=new Map<string,number>();for(const example of examples)for(const token of new Set(tokens(example)))df.set(token,(df.get(token)||0)+1);
 const vocabulary=[...df].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,1600).map(([token])=>token),idf=vocabulary.map(token=>Math.log((examples.length+1)/((df.get(token)||0)+1))+1);
 const index=new Map(vocabulary.map((token,i)=>[token,i])),model:PersonalModel={version:2,account,categories,vocabulary,idf,weights:categories.map(()=>vocabulary.map(()=>0)),bias:categories.map(()=>0),trainedAt:new Date().toISOString(),examples:personalCount,labelFingerprint:"",metrics:null};
 const rows=examples.map(example=>({x:vector(example,model,index),y:categories.indexOf(example.label),weight:example.key.startsWith("starter:")?1:3}));
 const counts=categories.map((_,i)=>rows.filter(row=>row.y===i).reduce((sum,row)=>sum+row.weight,0));
 for(let epoch=0;epoch<110;epoch++){
  const rate=.22/(1+epoch*.02);
  for(const row of rows){const scores=softmax(model.weights.map((weights,i)=>model.bias[i]+row.x.reduce((sum,[j,value])=>sum+weights[j]*value,0)));for(let i=0;i<categories.length;i++){const delta=(scores[i]-(row.y===i?1:0))*row.weight*rows.length/(categories.length*counts[i]);for(const [j,value]of row.x)model.weights[i][j]-=rate*delta*value;model.bias[i]-=rate*delta*.15;}}
  for(const weights of model.weights)for(let j=0;j<weights.length;j++)weights[j]*=.998;
 }
 return model;
}
const starters=new Map<MailboxAccount,PersonalModel>();
export function starterModel(account:MailboxAccount=mainMailAccount){let model=starters.get(account);if(!model){model=fit(examplesForAccount(account),0,account);starters.set(account,model);}return model;}
export function predictMail(mail:MailFeatures&{account?:MailboxAccount},model=starterModel(mail.account)):MailPrediction{
 const account=mail.account||model.account||mainMailAccount,categories=groupIds(account);
 if((model.account||mainMailAccount)!==account||JSON.stringify(categoriesForModel(model))!==JSON.stringify(categories)||model.weights.length!==categories.length||model.bias.length!==categories.length)model=starterModel(account);
 const index=new Map(model.vocabulary.map((token,i)=>[token,i])),x=vector(mail,model,index),scores=softmax(model.weights.map((weights,i)=>model.bias[i]+x.reduce((sum,[j,value])=>sum+weights[j]*value,0)));
 const winner=scores.indexOf(Math.max(...scores));return {label:categoriesForModel(model)[winner],score:scores[winner],scores,method:model.examples?"personal":"starter"};
}
/** Keep every sender in a single partition. Near-identical subject text is grouped too. */
export function splitReviewed(examples:TrainingExample[],categories:MailGroup[]=mailGroups.map(group=>group.id)){
 const normalizedSubject=(example:TrainingExample)=>example.subject.toLowerCase().replace(/^(?:(?:re|fw|fwd):\s*)+/g,"").replace(/\d+/g,"#").trim();
 const parents=examples.map((_,i)=>i);const root=(i:number):number=>parents[i]===i?i:(parents[i]=root(parents[i]));
 const seen=new Map<string,number>();examples.forEach((example,i)=>{const sender=(example.sender.match(/<([^>]+)>/)?.[1]||example.sender).trim().toLowerCase();for(const key of [sender?`sender:${sender}`:"",`subject:${normalizedSubject(example)}`].filter(Boolean)){if(seen.has(key))parents[root(i)]=root(seen.get(key)!);else seen.set(key,i);}});
 const groups=new Map<number,TrainingExample[]>();examples.forEach((example,i)=>groups.set(root(i),[...(groups.get(root(i))||[]),example]));
 const ordered=[...groups.values()].sort((a,b)=>hash(a.map(item=>item.key).sort().join()).localeCompare(hash(b.map(item=>item.key).sort().join()))),test:TrainingExample[]=[],train=[...examples];
 for(const category of categories){const available=ordered.filter(group=>group.some(example=>example.label===category));if(available.length<3)continue;const candidate=available.find(group=>!group.some(example=>test.includes(example)) && group.every(example=>train.filter(item=>item.label===example.label).length-group.filter(item=>item.label===example.label).length>=2));if(candidate){test.push(...candidate);for(const example of candidate)train.splice(train.indexOf(example),1);}}
 return {train,test,trainGroups:new Set(train.map(example=>root(examples.indexOf(example)))).size,testGroups:new Set(test.map(example=>root(examples.indexOf(example)))).size};
}
export function trainPersonalModel(examples:TrainingExample[],account:MailboxAccount=mainMailAccount):PersonalModel{
 const categories=groupIds(account),starterData=examplesForAccount(account);
 if(examples.some(example=>!validGroup(account,example.label)||!example.key.startsWith(`${account}:`)))throw new Error("Training examples must belong to this inbox and its categories.");
 examples=[...examples].sort((a,b)=>a.key.localeCompare(b.key));
 if(examples.length<8 || new Set(examples.map(example=>example.label)).size<2)throw new Error("Review at least 8 emails across at least 2 groups before training.");
 const split=splitReviewed(examples,categories);
 const heldOutSubjects=new Set(split.test.map(example=>example.subject.toLowerCase().trim()));
 const evaluationSeeds=starterData.filter(example=>!heldOutSubjects.has(example.subject.toLowerCase().trim()));
 const candidate=fit([...evaluationSeeds,...split.train],split.train.length,account);
 if(split.test.length){const matrix=categories.map(()=>categories.map(()=>0));for(const example of split.test){const actual=categories.indexOf(example.label),predicted=categories.indexOf(predictMail(example,candidate).label);matrix[actual][predicted]++;}
 const support=matrix.map(row=>row.reduce((a,b)=>a+b,0)),f1=matrix.map((row,i)=>{const tp=row[i],fp=matrix.reduce((sum,r)=>sum+r[i],0)-tp,fn=support[i]-tp;return 2*tp/(2*tp+fp+fn||1);});
 candidate.metrics={samples:split.test.length,accuracy:matrix.reduce((sum,row,i)=>sum+row[i],0)/split.test.length,macroF1:f1.filter((_,i)=>support[i]>0).reduce((a,b)=>a+b,0)/support.filter(Boolean).length,matrix,support,trainGroups:split.trainGroups,testGroups:split.testGroups};}
 // Evaluate before the final refit. The published model then uses all reviewed examples.
 const final=fit([...starterData,...examples],examples.length,account);final.metrics=candidate.metrics;final.labelFingerprint=labelFingerprint(examples);return final;
}
