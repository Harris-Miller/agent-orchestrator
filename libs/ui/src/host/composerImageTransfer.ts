/** Pure classifiers for image paste / drop into the Composer (DOM-free except {@link filesFromDataTransfer}). */

export const NOT_IMAGES_MESSAGE = 'Only PNG, JPEG, WebP and GIF images can be attached';

export type ClipboardPasteClass =
  | { readonly _tag: 'Ignore' }
  | { readonly _tag: 'Images'; readonly files: readonly File[] };

export type FileDropClass =
  | { readonly _tag: 'Ignore' }
  | { readonly _tag: 'Images'; readonly files: readonly File[]; readonly skippedMessage?: string }
  | { readonly _tag: 'NotImages'; readonly message: string };

const isImageFile = (file: File): boolean => file.type.startsWith('image/');

/** Mixed clipboard (any plain text) stays a text paste; image-only clipboards attach their images. */
export const classifyClipboardPaste = ({
  files,
  text,
}: {
  readonly files: readonly File[];
  readonly text: string;
}): ClipboardPasteClass => {
  if (text.length > 0) {
    return { _tag: 'Ignore' };
  }
  const images = files.filter(isImageFile);
  return images.length === 0 ? { _tag: 'Ignore' } : { _tag: 'Images', files: images };
};

export const classifyFileDrop = ({ files }: { readonly files: readonly File[] }): FileDropClass => {
  if (files.length === 0) {
    return { _tag: 'Ignore' };
  }
  const images = files.filter(isImageFile);
  if (images.length === 0) {
    return { _tag: 'NotImages', message: NOT_IMAGES_MESSAGE };
  }
  // Mixed drop: attach the images but tell the user the rest was skipped.
  return images.length === files.length
    ? { _tag: 'Images', files: images }
    : { _tag: 'Images', files: images, skippedMessage: NOT_IMAGES_MESSAGE };
};

/** `dt.files`, else file entries of `dt.items` (clipboard screenshots arrive as items). */
export const filesFromDataTransfer = (dt: DataTransfer): readonly File[] => {
  if (dt.files.length > 0) {
    return [...dt.files];
  }
  return [...dt.items].flatMap(item => {
    const file = item.kind === 'file' ? item.getAsFile() : null;
    return file === null ? [] : [file];
  });
};
