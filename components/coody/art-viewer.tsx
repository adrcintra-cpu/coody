'use client';
import { useState } from 'react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
export function ArtViewer({src,alt,height}:{src:string;alt:string;height:number}) {
  const [open,setOpen]=useState(false);
  return <><button type="button" className="art-zoom-trigger" aria-label={'Ampliar '+alt} onClick={()=>setOpen(true)}><Image unoptimized width={1080} height={height} src={src} alt={alt}/><span>Ampliar imagem</span></button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="art-zoom-modal"><DialogHeader><DialogTitle>{alt}</DialogTitle><DialogDescription>Visualização ampliada da arte.</DialogDescription></DialogHeader><div className="art-zoom-image"><Image unoptimized width={1080} height={height} src={src} alt={alt}/></div></DialogContent></Dialog></>;
}
