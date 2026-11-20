import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { supabase } from './supabase';

const MAX_BYTES = 2 * 1024 * 1024;

export const avatarUrl = (path?: string | null) =>
  path ? supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl : null;

/** Web: centre-crop to a 512px square JPEG so uploads are small and consistent. */
async function squareJpegWeb(uri: string): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new window.Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = uri;
  });
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  canvas.getContext('2d')!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 512, 512);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that photo'))), 'image/jpeg', 0.85));
}

/**
 * Pick (or take) a photo, upload it to avatars/<uid>/, save it on the profile and remove the old file.
 * Returns the new path, or null if the user cancelled.
 */
export async function changeAvatar(uid: string, oldPath: string | null, camera = false): Promise<string | null> {
  if (Platform.OS !== 'web') {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error(camera ? 'Camera access is needed to take a photo.' : 'Photo access is needed to choose a picture.');
  }
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, cameraType: ImagePicker.CameraType.front,
  };
  const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets[0]) return null;
  const asset = res.assets[0];

  const body = Platform.OS === 'web' ? await squareJpegWeb(asset.uri) : await (await fetch(asset.uri)).arrayBuffer();
  const size = body instanceof Blob ? body.size : body.byteLength;
  if (size > MAX_BYTES) throw new Error('That photo is too large (max 2 MB). Try another one.');

  const path = `${uid}/${Date.now().toString(36)}.jpg`;
  const up = await supabase.storage.from('avatars').upload(path, body, { contentType: 'image/jpeg' });
  if (up.error) throw new Error('Upload failed. Check your connection and try again.');
  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', uid);
  if (error) {
    await supabase.storage.from('avatars').remove([path]);
    throw new Error('Could not save your photo.');
  }
  if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);
  return path;
}

export async function removeAvatar(uid: string, oldPath: string) {
  const { error } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', uid);
  if (error) throw new Error('Could not remove your photo.');
  await supabase.storage.from('avatars').remove([oldPath]);
}
