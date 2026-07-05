import fs from 'node:fs';
import {
  readFile, stat
} from 'node:fs/promises';
import path from 'node:path';

import mime from 'mime-types';

import type {
  HandlerFn, HandlerResult 
} from '../server/handler.js';

interface IHandlerOptionsForStaticFiles {
  fileName?: string;
  fileRoot?: string;
  filePath?: string;
  contentType?: string;
  onDispose?: () => void;
}

function createHandlerForStaticFiles(options: IHandlerOptionsForStaticFiles): HandlerFn {
  const handlerFn: HandlerFn = async function (): Promise<HandlerResult> {
    let filePath = '';
    if (options.filePath) {
      filePath = options.filePath;
    } else if (options.fileRoot && options.fileName) {
      filePath = path.join(options.fileRoot, options.fileName);
    }
    if (!filePath) {
      throw new Error('file name & file root required');
    }
    if (options.fileRoot && !filePath.startsWith(options.fileRoot)) {
      throw new Error('unsafe file access denied');
    }

    const fileStat = await stat(filePath);
    const fileTooLarge = fileStat.size > 1 * 1024 * 1024;
    const fileContent = fileTooLarge ? fs.createReadStream(filePath) : await readFile(filePath);
    const contentType = options.contentType || mime.contentType(path.extname(filePath)) || 'application/octet-stream';

    try {
      return {
        status: 200,
        headers: {
          'content-type': contentType,
          ...fileTooLarge ? { 'content-length': fileStat.size.toString() } : {}
        },
        content: fileContent
      };
    } finally {
      options.onDispose?.();
    }
  };

  return handlerFn;
}

export default createHandlerForStaticFiles;

export type {
  IHandlerOptionsForStaticFiles
};
