import fs from 'fs';
import path from 'path';
import fsExtra from 'fs-extra';
import rimraf from 'rimraf'
import { PDFDocument } from 'pdf-lib';
import { fromPath } from 'pdf2pic';

export async function convertPdfToImagesInNode(pdfPath, outputDir, dpi = 300) {
  if (!fsExtra.existsSync(pdfPath)) {
    throw new Error("PDF file not found: " + pdfPath);
  }

  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pageCount = pdfDoc.getPageCount();
  const inputName = path.basename(pdfPath, path.extname(pdfPath));

  const { width, height } = pdfDoc.getPage(0).getSize();
  const widthPx = Math.round((width / 72) * dpi);
  const heightPx = Math.round((height / 72) * dpi);

  rimraf.sync(outputDir);
  fsExtra.mkdirsSync(outputDir);

  const options = {
    width: widthPx,
    height: heightPx,
    density: dpi,
    savePath: outputDir,
    format: "png",
    saveFilename: `${inputName}`,
  };

  const convert = fromPath(pdfPath, options);
  const images = await convert.bulk(-1);

  console.log(`Images saved to: ${outputDir}`);
}

//convertPdfToImages('./files/specimen1.pdf', './output', 300);
