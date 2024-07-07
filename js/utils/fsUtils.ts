import fs from 'fs';

export const deleteImage = async (imagePath: string) =>
  await fs.unlink(imagePath, (err) => {
    if (err) console.error('Error unlinking file', err);
  });
