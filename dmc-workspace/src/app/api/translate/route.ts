import { translateLocal } from "@/lib/local-translation";
import { isLocale } from "@/lib/locales";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let body;
  try {
    const raw=await request.text();
    if(raw.length>300000) return Response.json({error:"Pedido demasiado grande."},{status:413});
    body=JSON.parse(raw);
    if(!isLocale(body.target)||!Array.isArray(body.items)||body.items.length>400||body.items.some((i:{text:unknown;source:unknown})=>!i||typeof i.text!=="string"||i.text.length>20000||!["pt","en"].includes(String(i.source)))) throw new Error();
  } catch {return Response.json({error:"Pedido de tradução inválido."},{status:400});}
  try { return Response.json({texts:await translateLocal(body.items,body.target)},{headers:{"Cache-Control":"no-store"}}); }
  catch {return Response.json({error:"Tradução local indisponível. Verifique os modelos linguísticos ou tente novamente."},{status:503});}
}
