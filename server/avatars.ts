import sharp from 'sharp';
// Only small, decoded raster crops enter room state. Never accept remote URLs or SVG.
export async function validateAvatar(value:unknown):Promise<string|undefined> {
  if(value===undefined||value===null||value==='')return undefined;
  if(typeof value!=='string'||value.length>48000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw new Error('Use a cropped JPEG avatar under 36 KB.');
  try{
    const bytes=Buffer.from(value.split(',')[1],'base64');
    const image=sharp(bytes,{limitInputPixels:256*256,failOn:'warning'});
    const meta=await image.metadata();
    if(meta.format!=='jpeg'||!meta.width||!meta.height||meta.width>256||meta.height>256||meta.width<32||meta.height<32)throw new Error();
    const crop=await image.resize(160,160,{fit:'cover'}).jpeg({quality:82}).toBuffer();
    return `data:image/jpeg;base64,${crop.toString('base64')}`;
  }catch{throw new Error('That photo could not be decoded. Please crop a valid image again.');}
}
