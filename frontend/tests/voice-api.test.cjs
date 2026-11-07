const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function compile(file) { return ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: {module: ts.ModuleKind.CommonJS} }).outputText; }
const categories = {};
new Function('exports', compile('src/constants/productCategories.ts'))(categories);
class ApiError extends Error { constructor(status, message) { super(message); this.status=status; } }
let mock = false;
let session = {access_token:'test-merchant',role:'MERCHANT',expiresAt:Date.now()+600000};
let payload, status=200, postFailure;
const requests=[];
const api={};
const client={ApiError,
  postJson:async(url,body,token)=>{requests.push({url,body,token,method:'POST'});if(postFailure)throw postFailure;return payload;},
  deleteJson:async(url,token)=>{requests.push({url,token,method:'DELETE'});return payload;},
};
new Function('require','exports','fetch','FormData','process',compile('src/services/api/voice.ts'))(name=>name==='./multipart'?{postMultipart:async(url,body,options)=>{requests.push({url,method:'POST',body,...options});return{ok:status>=200&&status<300,status,json:async()=>payload};}}:name==='../devMock'?{isMockMode:()=>mock}:name==='./auth'?{getAuthSession:()=>session}:name==='./client'?client:name==='react-native'?{Platform:{OS:'ios'}}:categories,api,
  async(url,options)=>{requests.push({url,...options});return{ok:status>=200&&status<300,status,json:async()=>payload};},
  class FormData{constructor(){this.fields=[];}append(...field){this.fields.push(field);}},
  {env:{EXPO_PUBLIC_API_URL:'https://test.invalid'}});
function fixture(action) {
  const base={analysis_id:`analysis-${action}`,intent:api.analysisIntents[action],status:'READY',product_name:'사과',needs_confirmation:true,expires_at:new Date(Date.now()+600000).toISOString(),message:'분석 완료'};
  if(action==='registration'||action==='update')Object.assign(base,{price:5000,category:'FRUIT',category_name:'과일',missing_fields:[]});
  if(action==='registration')Object.assign(base,{unit:'한 봉지',transcript:'사과 한 봉지 오천 원'});
  else Object.assign(base,{product_id:7});
  if(action==='update')Object.assign(base,{discount_rate:20,discount_price:4000});
  if(action==='delete')base.price=10000;
  if(action==='soldOut')Object.assign(base,{is_sold_out:true,transcript:'사과 품절.'});
  if(action==='saleDelete')Object.assign(base,{sale_id:9,is_on_sale:false});
  return base;
}
async function main(){
  for(const action of ['registration','update','delete','soldOut','saleDelete']){
    payload=fixture(action);status=200;
    const target=action==='saleDelete'?9:action==='registration'?undefined:7;
    const result=await api.submitVoice(action,'file:///voice.m4a',target);
    assert.equal(result.kind,'analysis');assert.equal(result.intent,payload.intent);
    assert.ok(requests.at(-1).url.endsWith(api.voiceActions[action].path));
    const fields=requests.at(-1).body.fields;
    assert.ok(fields.some(([name])=>name==='audio_file'));
    if(target)assert.ok(fields.some(([name,value])=>name===(action==='saleDelete'?'sale_id':'product_id')&&value===String(target)));
  }
  assert.equal(api.parseVoiceAnalysis({...fixture('update'),discount_rate:null,discount_price:null},'update',7).discountRate,null);
  assert.equal(api.parseVoiceAnalysis({...fixture('update'),category:null,category_name:null,missing_fields:['category']},'update',7).category,null);
  assert.throws(()=>api.parseVoiceAnalysis({...fixture('update'),intent:'PRODUCT_DELETE'},'update',7));
  assert.throws(()=>api.parseVoiceAnalysis(fixture('update'),'update',8));
  assert.throws(()=>api.parseVoiceAnalysis({...fixture('update'),discount_rate:101},'update',7));
  assert.throws(()=>api.parseVoiceAnalysis({...fixture('update'),category:'UNKNOWN'},'update',7));
  assert.equal(api.parseVoiceAnalysis(fixture('soldOut'),'soldOut',7).isSoldOut,true);
  assert.throws(()=>api.parseVoiceAnalysis({...fixture('soldOut'),is_sold_out:false},'soldOut',7));
  assert.throws(()=>api.parseVoiceAnalysis(fixture('soldOut'),'soldOut',8));
  const analysis=api.parseRegistrationAnalysis(fixture('registration'));
  const confirmed={product_name:'배',price:3000,unit:'1봉',category:'FRUIT',category_name:'과일'};
  payload={analysis_id:analysis.analysisId,intent:analysis.intent,status:'APPLIED',product_id:101,product_name:'배',category:'FRUIT',category_name:'과일',message:'등록 완료'};
  assert.equal((await api.applyVoiceAnalysis(analysis,confirmed)).product_id,101);
  assert.deepEqual(requests.at(-1).body,{confirmed_fields:confirmed});
  assert.ok(requests.at(-1).url.endsWith('/apply'));
  const count=requests.length;
  await assert.rejects(()=>api.applyVoiceAnalysis({...analysis,expiresAt:'2000-01-01T00:00:00Z'},confirmed),e=>e.status===409);
  assert.equal(requests.length,count);
  postFailure=new ApiError(409,'이미 반영됨');await assert.rejects(()=>api.applyVoiceAnalysis(analysis,confirmed),e=>e.status===409);postFailure=undefined;
  payload={analysis_id:analysis.analysisId,status:'CANCELLED',message:'취소 완료'};
  await api.cancelVoiceAnalysis(analysis.analysisId);
  assert.equal(requests.at(-1).method,'DELETE');assert.equal(requests.at(-1).body,undefined);
  mock=true;
  for(const action of ['registration','update','delete','soldOut','saleDelete']){
    const value=api.mockVoiceAnalysis(action,7);
    await api.applyVoiceAnalysis(value,action==='registration'||action==='update'?confirmed:undefined);
    await assert.rejects(()=>api.applyVoiceAnalysis(value),e=>e.status===409);
    await assert.rejects(()=>api.cancelVoiceAnalysis(value.analysisId),e=>e.status===409);
    const discard=api.mockVoiceAnalysis(action,7);await api.cancelVoiceAnalysis(discard.analysisId);
    await assert.rejects(()=>api.applyVoiceAnalysis(discard),e=>e.status===409);
  }
  const owned=api.mockVoiceAnalysis('registration');session={...session,access_token:'other-merchant'};
  await assert.rejects(()=>api.applyVoiceAnalysis(owned),e=>e.status===404);
  console.log('PASS: 5 analysis contracts; target/category/discount validation; apply fields; expiry/conflict; bodyless cancel; mock duplicate/cancel/account isolation');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
