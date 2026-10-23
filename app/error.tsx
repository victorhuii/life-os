"use client";
export default function ErrorPage({reset}:{error:Error;reset:()=>void}) {
  return <main role="alert" style={{padding:"15vh 24px",textAlign:"center",fontFamily:"system-ui,sans-serif",color:"var(--text,#5d4635)",background:"var(--bg,#f5f0e8)",minHeight:"100vh"}}><h1 style={{fontSize:22}}>Your workspace couldn’t load.</h1><p>Please try again. Your saved data is still there.</p><button onClick={reset} style={{padding:"10px 16px",margin:8,cursor:"pointer"}}>Try again</button><button onClick={()=>location.reload()} style={{padding:"10px 16px",margin:8,cursor:"pointer"}}>Reload page</button></main>;
}
