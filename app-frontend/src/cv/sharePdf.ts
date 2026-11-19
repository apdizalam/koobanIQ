import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Saves the PDF in the app's cache (the phone may clear it later) and opens the
 * share sheet, where the user can open it, save it to Files or send it.
 * Returns false when the phone cannot share files.
 */
export async function sharePdf(bytes: Uint8Array, fileName: string): Promise<boolean> {
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(bytes);
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: fileName,
  });
  return true;
}
