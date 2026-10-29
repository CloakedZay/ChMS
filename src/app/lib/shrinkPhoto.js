// Phone photos are often 4–8 MB; a JPEG shrunk to at most maxSide pixels on
// the long side is still easy to read. Used for sign-in sheet photos
// (AttendanceSheet.js), event photos (EventPhotos.js) and profile photos.
export async function shrinkPhoto(file, maxSide = 2000, quality = 0.82) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;   // a format the browser can't draw: upload as it is
  }
}
