import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, FileSystemAdapter, TFile, SearchComponent } from 'obsidian';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import { normalizePath } from "obsidian";

interface Settings {
	imageOutput: string;
	mdOutput: string;
}

const DEFAULT_SETTINGS: Settings = {
	imageOutput: '/',
	mdOutput: '/'
}

export type TextExtractorApi = {
	extractText: (file: TFile) => Promise<string>
	canFileBeExtracted: (filePath: string) => boolean
	isInCache: (file: TFile) => Promise<boolean>
  }

export function getTextExtractor(): TextExtractorApi | undefined {
	return (this.app as any).plugins?.plugins?.['text-extractor']?.api
}

const logsList: string[] = [];
const skippedPages: number[] = []; 

export default class UniNotes extends Plugin {
	settings: Settings;

	async onload() {
		await this.loadSettings();

		const ribbonIconEl = this.addRibbonIcon('notebook-pen', 'Uni Notes', async (evt: MouseEvent) => {
			
			const workerPath = this.app.vault.adapter.getResourcePath(`${this.manifest.dir}/pdf.worker.js`);
			try {
			const res = await fetch(workerPath);
			if (!res.ok) {
				throw new Error(`Worker fetch failed: ${res.statusText}`);
			}
			} catch (e) {
			logsList.push("Could not fetch pdf.worker.js at", workerPath, e);
			}
			GlobalWorkerOptions.workerSrc = workerPath;

			const popup = new PathsPopup(this.app);
			popup.openAndGetPaths().then(async ([pdfPath, markdownPath, mdFileName, tags, extractText]) => {
			  
			  const adapter = this.app.vault.adapter;

			  if (adapter instanceof FileSystemAdapter) {
				 let fullPdfFile = this.app.vault.getFileByPath(pdfPath); //this is a TFile it has the file itself
				 
				 let imagesDir = pdfPath.split('/').pop()?.replace('.pdf', '') || 'output';

				  let newDirName = `${imagesDir}-output-${Date.now()}`; //keep it unique
				  if(this.settings.imageOutput != '/' && this.settings.imageOutput != ''){
					newDirName = `${this.settings.imageOutput}/${imagesDir}-${Date.now()}`
				  }
			
				  await this.app.vault.createFolder(newDirName);

				  const images = await convertPDFToImages(pdfPath, newDirName);
				  images.forEach(imagePath => new Notice(imagePath));

				  await new Promise(resolve => setTimeout(resolve, 1000)); //let the images settle in ig

				  //let testFolder = 'images'
				  const text: string = await createMarkdownFromImages(newDirName, tags, extractText); 
				  
				  let newFileName;

				  if(this.settings.mdOutput != '/' && this.settings.mdOutput != '' && markdownPath == ''){ // if default isnt blank, and the popup is blank, then save it to the default directory
					newFileName = `${this.settings.mdOutput}/${mdFileName}.md`
				  }
				  else if(markdownPath != ''){ // popup directory takes precedence, so if the markdownPath isnt blank, then save it to that location
					newFileName = `${markdownPath}/${mdFileName}.md`
				  }
				  else{ //otherwise, root folder
					newFileName = `${mdFileName}.md`
				  }

				  await this.app.vault.create(newFileName, text);
			  }
			  
			const logsModal = new logsPopup(this.app, logsList);
			logsModal.open();
			  
			});

		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingsTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

export class PathsPopup extends Modal {
	private resolve: ((value: [string, string, string, string, boolean]) => void) | null = null;

	constructor(app: App) {
	  super(app);
	  this.setTitle('Uni Notes PDF to Markdown');
  
	  let pdfPath = '';

	  new Setting(this.contentEl)
		.setName('PDF path')
		.addSearch((search) => {
		  search
			.setPlaceholder('Search and select a PDF...')
			.onChange((value) => {
			  const pdfFiles = app.vault.getFiles().filter(file =>
				file.extension === 'pdf' &&
				file.name.toLowerCase().includes(value.toLowerCase())
			  );
	  
			  const datalistId = 'pdf-search-datalist';
			  let datalist = this.containerEl.querySelector(`#${datalistId}`) as HTMLDataListElement;
	  
			  if (!datalist) {
				datalist = document.createElement('datalist');
				datalist.id = datalistId;
				this.containerEl.appendChild(datalist);
				search.inputEl.setAttribute('list', datalistId);
			  }
	  
			  while (datalist.firstChild) {
				datalist.removeChild(datalist.firstChild);
			  }
	  
			  for (const file of pdfFiles) {
				const option = document.createElement('option');
				option.value = file.path;
				datalist.appendChild(option);
			  }
			});
	  
		  search.inputEl.addEventListener('blur', () => {
			pdfPath = search.getValue();
		  });
		});	  

		let mdFileName = '';
		new Setting(this.contentEl)
			.setName('Markdown file name')
			.setDesc('Enter a name for the new Markdown File')
			.addText((text) =>
			  text.onChange((value) => {
				mdFileName = value;
			  }));

			  let tags = '';
			  new Setting(this.contentEl)
				  .setName('Tags')
				  .setDesc('Enter tags for the new markdown file, separated by a comma and a space, e.g. english, literature, homework')
				  .addText((text) =>
					text.onChange((value) => {
					  tags = value;
					}));

	let markdownFilePath = '';
	new Setting(this.contentEl)
	  .setName('Markdown output path')
	  .setDesc('Use this if you want the file to be saved in a different location from the default.')
	  .addText((text) =>
		text.onChange((value) => {
		  markdownFilePath = value;
		}));

	let extractText = false;
	new Setting(this.contentEl)
		.setName('Extract Text?')
		.setDesc('If enabled, text will be extracted from images using the Text Extractor Plugin.')
		.addToggle(toggle => {
			toggle.setValue(extractText)
				.onChange((value) => {
					extractText = value;
				});
		});
    
	  new Setting(this.contentEl)
		.addButton((btn) =>
		  btn
			.setButtonText('Start')
			.setCta()
			.onClick(() => {
			  this.close();
			  if (this.resolve) {
				this.resolve([pdfPath, markdownFilePath, mdFileName, tags, extractText]);
			  }
			}));
	}
	
  
	openAndGetPaths(): Promise<[string, string, string, string, boolean]> {
	  this.open();
	  return new Promise((resolve) => {
		this.resolve = resolve;
	  });
	}
  }


export class logsPopup extends Modal {
    constructor(app: App, private logsList: string[]) {
        super(app);
    }

    onOpen() {
        const fullLogs = this.logsList.filter(s => s).join('\n');
        
        new Setting(this.contentEl)
            .setName('Logs')
            .setDesc(fullLogs);
            
        new Setting(this.contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('Close')
                    .setCta()
                    .onClick(() => {
                        this.close();
                    })
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

async function convertPDFToImages(pdfPath: string, outputDir: string, dpi = 150): Promise<string[]> {
  const adapter = this.app.vault.adapter;
  const outputPaths: string[] = [];

  logsList.push(`[convertPDFToImages] Starting conversion. PDF path: ${pdfPath}, Output dir: ${outputDir}, DPI: ${dpi}`);

  try {
    const pdfData = await adapter.readBinary(normalizePath(pdfPath));
    logsList.push(`[convertPDFToImages] Successfully read PDF data (${pdfData.byteLength} bytes)`);

    const loadingTask = getDocument({ data: pdfData });
    const pdf = await loadingTask.promise;

    logsList.push(`[convertPDFToImages] PDF loaded. Total pages: ${pdf.numPages}`);
    new Notice(`PDF loaded, total pages: ${pdf.numPages}`);

    const scale = dpi / 96;
    logsList.push(`[convertPDFToImages] Render scale set to: ${scale}`);

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      logsList.push(`[convertPDFToImages] Rendering page ${pageNumber}/${pdf.numPages}`);
      new Notice(`Rendering page ${pageNumber}/${pdf.numPages}`);

      let page;
      try {
        page = await pdf.getPage(pageNumber);
      } catch (err) {
        logsList.push(`[convertPDFToImages] Failed to load page ${pageNumber}:`, err);
        new Notice(`Skipping page ${pageNumber} — failed to load.`);
        skippedPages.push(pageNumber);
        continue;
      }

      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d")!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderPromise = page.render({
        canvas,
        canvasContext: context,
        viewport,
      }).promise;

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Render timeout")), 15000)
      );

      try {
        await Promise.race([renderPromise, timeoutPromise]);
        logsList.push(`[convertPDFToImages] Page ${pageNumber} rendered successfully.`);
      } catch (err: any) {
        const errMsg = String(err?.message || err);
        if (errMsg.includes("UnknownErrorException") || errMsg.includes("Cannot transfer object")) {
          logsList.push(`[convertPDFToImages] Skipping page ${pageNumber} due to render error: ${errMsg}`);
          new Notice(`Skipping page ${pageNumber} — PDF render error.`);
          skippedPages.push(pageNumber);
          continue;
        }
        if (errMsg.includes("Render timeout")) {
         logsList.push(`[convertPDFToImages] Skipping page ${pageNumber} (took too long).`);
          new Notice(`Skipping page ${pageNumber} — render timeout.`);
          skippedPages.push(pageNumber);
          continue;
        }
        logsList.push(`[convertPDFToImages] Skipping page ${pageNumber} due to unexpected error:`, err);
        new Notice(`Skipping page ${pageNumber} — unexpected error.`);
        skippedPages.push(pageNumber);
        continue;
      }

      const dataUrl = canvas.toDataURL("image/png");
      const base64Data = dataUrl.split(",")[1];
      const binary = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

      const pageImagePath = normalizePath(`${outputDir}/page-${pageNumber}.png`);
      logsList.push(`[convertPDFToImages] Saving page ${pageNumber} to: ${pageImagePath}`);
      new Notice(`Saving page ${pageNumber}/${pdf.numPages} to: ${pageImagePath}`);

      await adapter.writeBinary(pageImagePath, binary);
      outputPaths.push(pageImagePath);
    }

    logsList.push(`[convertPDFToImages] Conversion complete. Generated ${outputPaths.length} images.`);
    if (skippedPages.length > 0) {
      logsList.push(`[convertPDFToImages] Skipped pages: ${skippedPages.join(", ")}`);
      new Notice(`Conversion complete — skipped pages: ${skippedPages.join(", ")}`);
    } else {
      logsList.push(`[convertPDFToImages] No pages were skipped.`);
      new Notice("PDF successfully converted to images — no skipped pages!");
    }

    return outputPaths;

  } catch (error) {
    logsList.push(`[convertPDFToImages] Error during conversion:`, error);
    new Notice(`Error converting PDF: ${error.message}`);
    throw error;
  }
}

	  
async function createMarkdownFromImages(folderPath: string, tags: string, extractText: boolean) {
  logsList.push(`[createMarkdownFromImages] Starting process. Folder: ${folderPath}, Tags: ${tags}, Extract text: ${extractText}`);

  const tagsThenimagePaths: string[] = [];
  const yamlTags = tags.split(/\s*,\s*/);

  const yaml = `---\ntags:\n${yamlTags.map(t => `  - ${t}`).join('\n')}\n---`;
  tagsThenimagePaths.push(yaml);

  try {
    const files: TFile[] = this.app.vault.getFiles()
      .filter((file: TFile) =>
        file.path.startsWith(folderPath) &&
        file.extension.match(/^(png|jpg|jpeg|gif|webp|svg)$/i)
      )
      .sort((a: TFile, b: TFile) => a.stat.ctime - b.stat.ctime);

    logsList.push(`[createMarkdownFromImages] Found ${files.length} image files in ${folderPath}`);

    for (const file of files) {
      const chosenFile = this.app.vault.getFileByPath(file.path);
      logsList.push(`[createMarkdownFromImages] Processing file: ${file.path}`);
      new Notice(`Extracting text from ${chosenFile?.path || 'unknown file'}`);

	let textTwo: string = "";

	if (chosenFile && extractText === true) {
	try {
		const extractor = getTextExtractor();
		textTwo = (await extractor?.extractText(chosenFile)) ?? "";
		if (!textTwo) {
		logsList.push(`[createMarkdownFromImages] Text extraction failed for ${file.path}`);
		new Notice("Text extraction failed.");
		textTwo = "Text extraction failed.";
		} else {
		logsList.push(`[createMarkdownFromImages] Text successfully extracted from ${file.path}`);
		}
	} catch (textError) {
		logsList.push(`[createMarkdownFromImages] Error extracting text from ${file.path}:`, textError);
		textTwo = "Error during text extraction.";
	}
	}


      logsList.push(`[createMarkdownFromImages] Adding image to markdown: ![[${folderPath}/${file.name}]]`);
      tagsThenimagePaths.push(`![[${folderPath}/${file.name}]]\n${textTwo}\n`);
    }

    new Notice("Markdown file successfully created from images!");
    logsList.push(`[createMarkdownFromImages] Markdown content:\n${tagsThenimagePaths.join('\n')}`);

    return tagsThenimagePaths.join("\n");

  } catch (error) {
    logsList.push(`[createMarkdownFromImages] Error during markdown creation:`, error);
    new Notice(`Error creating markdown: ${error.message}`);
    throw error;
  }
}


class SettingsTab extends PluginSettingTab {
	plugin: UniNotes;

	constructor(app: App, plugin: UniNotes) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Images output location')
			.setDesc('Select where image folders should be created by default. If left blank, folders will be created in the root directory.')
			.addText(text => text
				.setPlaceholder('Enter a valid path')
				.setValue(this.plugin.settings.imageOutput)
				.onChange(async (value) => {
					this.plugin.settings.imageOutput = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default markdown output location')
			.setDesc('Select where markdown files should be output by default. If left blank, files will be created in the root directory.')
			.addText(text => text
				.setPlaceholder('Enter a valid path')
				.setValue(this.plugin.settings.mdOutput)
				.onChange(async (value) => {
					this.plugin.settings.mdOutput = value;
					await this.plugin.saveSettings();
				}));
	}
}
