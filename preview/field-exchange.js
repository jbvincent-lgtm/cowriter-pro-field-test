(() => {
  'use strict';

  const encoder=new TextEncoder();
  const decoder=new TextDecoder();

  function crc32(bytes){let crc=-1;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit+=1)crc=(crc>>>1)^(crc&1?0xedb88320:0);}return(crc^-1)>>>0;}
  function zipStore(files){
    const chunks=[],directory=[];let offset=0;const u16=value=>[value&255,value>>>8&255];const u32=value=>[value&255,value>>>8&255,value>>>16&255,value>>>24&255];
    Object.entries(files).forEach(([name,source])=>{const filename=encoder.encode(name),data=source instanceof Uint8Array?source:encoder.encode(String(source)),crc=crc32(data);const local=new Uint8Array([80,75,3,4,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(data.length),...u32(data.length),...u16(filename.length),0,0,...filename]);chunks.push(local,data);const central=new Uint8Array([80,75,1,2,20,0,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(data.length),...u32(data.length),...u16(filename.length),0,0,0,0,0,0,0,0,0,0,0,0,...u32(offset),...filename]);directory.push(central);offset+=local.length+data.length;});
    const directorySize=directory.reduce((sum,item)=>sum+item.length,0),end=new Uint8Array([80,75,5,6,0,0,0,0,...u16(directory.length),...u16(directory.length),...u32(directorySize),...u32(offset),0,0]);return new Blob([...chunks,...directory,end],{type:'application/zip'});
  }

  async function parseStoredZip(source){
    const buffer=source instanceof ArrayBuffer?source:await source.arrayBuffer();
    if(buffer.byteLength>512*1024*1024)throw new Error('Bundle is larger than 512 MB');
    const bytes=new Uint8Array(buffer),view=new DataView(buffer);let offset=0,count=0,total=0;const entries={};
    while(offset+4<=bytes.length&&view.getUint32(offset,true)===0x04034b50){
      if(offset+30>bytes.length)throw new Error('Incomplete ZIP entry');
      const flags=view.getUint16(offset+6,true),method=view.getUint16(offset+8,true),expectedCrc=view.getUint32(offset+14,true),compressedSize=view.getUint32(offset+18,true),size=view.getUint32(offset+22,true),nameLength=view.getUint16(offset+26,true),extraLength=view.getUint16(offset+28,true);
      if(flags&1)throw new Error('Encrypted ZIP entries are not supported');if(flags&8)throw new Error('Streaming ZIP entries are not supported');if(method!==0)throw new Error('This bundle uses unsupported compression');if(compressedSize!==size)throw new Error('Invalid stored ZIP entry');
      const nameStart=offset+30,dataStart=nameStart+nameLength+extraLength,dataEnd=dataStart+size;if(dataEnd>bytes.length)throw new Error('Incomplete ZIP data');
      const name=decoder.decode(bytes.slice(nameStart,nameStart+nameLength));if(!name||name.includes('..')||name.startsWith('/')||name.includes('\\'))throw new Error('Unsafe ZIP path');if(entries[name])throw new Error(`Duplicate ZIP entry: ${name}`);
      const data=bytes.slice(dataStart,dataEnd);if(crc32(data)!==expectedCrc)throw new Error(`Damaged ZIP entry: ${name}`);entries[name]=data;offset=dataEnd;count+=1;total+=size;if(count>256||total>500*1024*1024)throw new Error('Bundle contains too much data');
    }
    if(!count)throw new Error('No readable files found in bundle');return entries;
  }

  function readJson(entries,name){if(!entries[name])throw new Error(`${name} is missing`);return JSON.parse(decoder.decode(entries[name]));}

  window.CoWriterFieldExchange={zipStore,parseStoredZip,readJson,crc32};
})();
