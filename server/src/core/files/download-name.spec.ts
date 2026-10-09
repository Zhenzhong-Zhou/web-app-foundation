import { downloadName } from './files.service';

describe('downloadName', () => {
  it('keeps the stem and gives the stored extension', () => {
    expect(downloadName('IMG_0042.JPG', 'webp')).toBe('IMG_0042.webp');
  });

  it('drops folders, control characters and quotes', () => {
    expect(downloadName('C:\\Users\\bob\\"logo"\u0007.svg', 'png')).toBe(
      'logo.png',
    );
  });

  it('turns a name multer read as Latin-1 back into UTF-8', () => {
    const sent = Buffer.from('商标.png', 'utf8').toString('latin1');
    expect(downloadName(sent, 'png')).toBe('商标.png');
  });

  it('names a nameless file', () => {
    expect(downloadName('.png', 'png')).toBe('file.png');
  });
});
