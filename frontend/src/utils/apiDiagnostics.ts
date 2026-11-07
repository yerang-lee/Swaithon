import { redactDiagnostic, reportDiagnostic } from './appDiagnostics';
export function logApiError(method:string,path:string,reason:string,status?:number,serverDetail?:unknown,privateValues:string[]=[]){
  if(!__DEV__)return;
  const code=serverDetail&&typeof serverDetail==='object'&&!Array.isArray(serverDetail)&&'code' in serverDetail&&typeof serverDetail.code==='string'?serverDetail.code:undefined;
  // 원본 응답/입력값은 제외하고 경로·상태·정제한 원인만 전달합니다.
  reportDiagnostic({scope:`API ${method} ${path.split('?')[0]}`,message:redactDiagnostic(reason,privateValues),status,code});
}
