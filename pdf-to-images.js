const { fromPath } = require("pdf2pic");
const { mkdirsSync, existsSync, writeFileSync } = require("fs-extra");
const rimraf = require("rimraf");
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const pdf = require("pdf-parse");

async function extractPageText(pdfPath, pageIndex) {
  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(pdfBuffer);
    
    const pages = data.text.split('\f'); 
    
    if (pages.length > pageIndex) {
      const pageText = pages[pageIndex].trim();
      return pageText || `[No text content found on page ${pageIndex + 1}]`;
    } else {
      const totalPages = data.numpages;
      const textLength = data.text.length;
      const pageSize = Math.floor(textLength / totalPages);
      const startPos = pageIndex * pageSize;
      const endPos = Math.min((pageIndex + 1) * pageSize, textLength);
      
      const pageText = data.text.substring(startPos, endPos).trim();
      return pageText || `[No text content found on page ${pageIndex + 1}]`;
    }
  } catch (error) {
    console.warn(`WARNING: Could not extract text from page ${pageIndex + 1}:`, error.message);
    return `[Text extraction failed for page ${pageIndex + 1}]`;
  }
}

async function convertPdfToImagesAndMarkdown(pdfPath, outputDir, dpi = 300) {
  if (!existsSync(pdfPath)) {
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
  mkdirsSync(outputDir);

  const options = {
    width: widthPx,
    height: heightPx,
    density: dpi,
    savePath: outputDir,
    format: "png",
    saveFilename: `${inputName}`
  };

  const convert = fromPath(pdfPath, options);
  const images = await convert.bulk(-1);

  let markdownContent = `# Slide Images for ${inputName}\n\n`;
  
  for (let i = 0; i < images.length; i++) {
    const pageNum = i + 1;
    const imagePath = `${inputName}.${pageNum}.png`;
    
    console.log(`Extracting text from page ${pageNum}`);
    const text = await extractPageText(pdfPath, i);
    
    markdownContent += `## Page ${pageNum}\n\n`;
    markdownContent += `![${imagePath}](${imagePath})\n\n`;
    
    if (text && text.trim() && !text.includes('[No text content found]') && !text.includes('[Text extraction failed]')) {
      markdownContent += `### Extracted Text:\n\n${text}\n\n`;
    } else {
      markdownContent += `*NO TEXT*\n\n`;
    }
    
    markdownContent += `---\n\n`;
  }

  const mdPath = path.join(outputDir, `${inputName}.md`);
  writeFileSync(mdPath, markdownContent, "utf-8");
  
  console.log(`Images saved to: ${outputDir}`);
  console.log(`Markdown saved to: ${mdPath}`);
  console.log(`Processed ${images.length} pages`);
}

(async () => {
  try {
    const args = process.argv.slice(2);
    if (args.length < 2) {
      console.error("Usage: node convert-pdf.js <input.pdf> <output-dir> [dpi]");
      console.error("Example: node convert-pdf.js presentation.pdf ./output 300");
      process.exit(1);
    }

    const [pdfPath, outputDir, dpiArg] = args;
    const dpi = dpiArg ? parseInt(dpiArg, 10) : 300;

    if (dpi < 72 || dpi > 600) {
      console.warn("Warning: DPI should typically be between 72-600. Using provided value:", dpi);
    }

    await convertPdfToImagesAndMarkdown(pdfPath, outputDir, dpi);
  } catch (error) {
    console.error("ERROR:", error.message);
    process.exit(1);
  }
})();