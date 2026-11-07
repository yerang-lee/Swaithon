declare global { var __jangbosoLogError: ((scope:string,error:unknown)=>void) | undefined; }
import Constants from 'expo-constants';

type Report={scope:string;message:string;stack?:string;status?:number;code?:string;level?:string};
const sent=new Map<string,number>();
const seen=new WeakSet<object>();
let installed=false,reporting=false;
const loggingGlobal=globalThis as typeof globalThis&{__jangbosoDiagnostics?:{installed:boolean;secrets?:()=>Array<string|undefined>;warn:(...args:unknown[])=>void;error:(...args:unknown[])=>void}};
const consoleState=loggingGlobal.__jangbosoDiagnostics??{installed:false,warn:console.warn.bind(console),error:console.error.bind(console)};
loggingGlobal.__jangbosoDiagnostics=consoleState;
const originalWarn=consoleState.warn;
export function redactDiagnostic(value:string,privateValues:string[]=[]):string {
  let text=value;
  let activeSecrets:Array<string|undefined>=[];try{activeSecrets=consoleState.secrets?.()??[];}catch{}
  for(const secret of [...privateValues,...activeSecrets])if(secret)text=text.split(secret).join('[숨김]');
  return text.replace(/Bearer\s+\S+/gi,'Bearer [숨김]').replace(/\beyJ[\w.-]+/g,'[토큰 숨김]').replace(/\b01\d[-\s]?\d{3,4}[-\s]?\d{4}\b/g,'[전화번호 숨김]').replace(/([?&](?:token|key|appkey|password|phone|text|query|keyword)=)[^&\s]*/gi,'$1[숨김]').replace(/((?:access_token|refresh_token|password|transcript|audio_file|image_file|GEMINI_API_KEY)["'\s]*[:=]["'\s]*)[^,}\r\n]+/gi,'$1[숨김]').slice(0,6000);
}
function format(value:unknown):string {
  if(value instanceof Error){const status=(value as Error&{status?:unknown}).status;return typeof status==='number'?`${value.name}: HTTP ${status}`:`${value.name}: ${value.message}`;}
  if(typeof value==='string')return value;
  if(value===null||typeof value!=='object')return String(value);
  return '[객체 내용 생략]';
}
export function reportDiagnostic(report:Report,print=true){
  if(!__DEV__||reporting)return;
  const clean={...report,scope:redactDiagnostic(report.scope),code:report.code?redactDiagnostic(report.code):undefined,message:redactDiagnostic(report.message),stack:report.stack?redactDiagnostic(report.stack):undefined};
  const fingerprint=`${clean.scope}:${clean.message}:${clean.status??''}`;
  const now=Date.now();if(now-(sent.get(fingerprint)??0)<2000)return;sent.set(fingerprint,now);
  if(sent.size>200)sent.delete(sent.keys().next().value!);
  reporting=true;
  try{
    if(print)originalWarn('[앱 오류]',JSON.stringify(clean));
    const host=Constants.expoConfig?.hostUri;
    const browserOrigin=typeof window!=='undefined'?window.location?.origin:undefined;
    const origin=browserOrigin&&/^https?:\/\//.test(browserOrigin)?browserOrigin:host?(/^https?:\/\//.test(host)?new URL(host).origin:`http://${host.split('/')[0]}`):browserOrigin;
    if(origin&&/^https?:\/\//.test(origin))void fetch(`${origin}/__jangboso_app_log`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(clean)}).catch(()=>{});
  }catch{/* 진단 실패로 앱 오류를 추가 생성하지 않습니다. */}finally{reporting=false;}
}
export function logAppError(scope:string,error:unknown){
  if(!__DEV__)return;
  if(error&&typeof error==='object'){if(seen.has(error))return;seen.add(error);}
  const object=error as {status?:unknown;code?:unknown;stack?:unknown}|null;
  const status=typeof object?.status==='number'?object.status:undefined;
  reportDiagnostic({scope,message:status===0?'네트워크 연결 실패':status!==undefined?`요청 실패 (HTTP ${status})`:format(error),status,code:typeof object?.code==='string'?redactDiagnostic(object.code):undefined,stack:typeof object?.stack==='string'?object.stack.split('\n').slice(1,14).join('\n'):undefined});
}
export function installDiagnostics(secrets?:()=>Array<string|undefined>){
  if(secrets)consoleState.secrets=secrets;
  if(__DEV__)globalThis.__jangbosoLogError=logAppError;
  if(!__DEV__||installed||consoleState.installed)return;installed=true;consoleState.installed=true;
  const error=consoleState.error,warn=consoleState.warn;
  console.error=(...args:unknown[])=>{error(...args.map(v=>redactDiagnostic(format(v))));reportDiagnostic({scope:'console.error',message:args.map(format).join(' '),level:'error'},false);};
  console.warn=(...args:unknown[])=>{warn(...args.map(v=>redactDiagnostic(format(v))));reportDiagnostic({scope:'console.warn',message:args.map(format).join(' '),level:'warning'},false);};
  const globals=globalThis as typeof globalThis&{ErrorUtils?:{getGlobalHandler?:()=>((error:Error,isFatal?:boolean)=>void);setGlobalHandler?:(handler:(error:Error,isFatal?:boolean)=>void)=>void}};
  const previous=globals.ErrorUtils?.getGlobalHandler?.();
  globals.ErrorUtils?.setGlobalHandler?.((error,isFatal)=>{logAppError(isFatal?'JS 치명적 오류':'JS 미처리 오류',error);previous?.(error,isFatal);});
  if(typeof window!=='undefined'&&typeof window.addEventListener==='function'){
    window.addEventListener('error',event=>logAppError('웹 미처리 오류',event.error??event.message));
    window.addEventListener('unhandledrejection',event=>logAppError('웹 Promise 미처리 오류',event.reason));
  }
}
