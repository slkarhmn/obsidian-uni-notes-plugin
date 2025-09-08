import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, FileSystemAdapter, TFile } from 'obsidian';
import path from 'path';
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


export default class UniNotes extends Plugin {
	settings: Settings;

	async onload() {
		const workerPath = this.app.vault.adapter.getResourcePath(`${this.manifest.dir}/assets/pdf.worker.js`);
			try {
			const res = await fetch(workerPath);
			if (!res.ok) {
				throw new Error(`Worker fetch failed: ${res.statusText}`);
			}
			console.log("PDF.js worker script is accessible at:", workerPath);
			} catch (e) {
			console.error("Could not fetch pdf.worker.js at", workerPath, e);
			}
			GlobalWorkerOptions.workerSrc = workerPath;
			console.log("Set GlobalWorkerOptions.workerSrc to:", workerPath);

		await this.loadSettings();

		const ribbonIconEl = this.addRibbonIcon('notepad-text-dashed', 'Uni Notes', async (evt: MouseEvent) => {

			const popup = new PathsPopup(this.app);
			popup.openAndGetPaths().then(async ([pdfPath, markdownPath, mdFileName]) => {
			  console.log('PDF Path:', pdfPath);
			  console.log('Markdown File Name:', mdFileName);
			  console.log('Markdown Path:', markdownPath);
			  
			  const adapter = this.app.vault.adapter;

			  if (adapter instanceof FileSystemAdapter) {
				  const vaultRoot = adapter.getBasePath();
				  console.log("Vault is stored at:", vaultRoot);

				  //let fullPDFPath = adapter.getFullPath(pdfPath);
				 let fullPdfFile = this.app.vault.getFileByPath(pdfPath); //this is a TFile it has the file itself
				 
				 let imagesDir = path.parse(path.basename(pdfPath)).name;

/* 				  if (fullPdfFile != null){
					convertPdfToImagesInVault(this.app, fullPdfFile, fullOutputPath, 300);
					convertPdfToImagesInNode(fullPDFPath, fullOutputPath, 300);
					console.log("PDF to image COMPLETE yaY");
				  }
				  else{
					console.log("oh no")
				  } 
*/
				  let newDirName = `${imagesDir}-output-${Date.now()}`; //keep it unique
				  if(this.settings.imageOutput != '/'){
					newDirName = `${this.settings.imageOutput}/${imagesDir}-${Date.now()}`
				  }
			
				  await this.app.vault.createFolder(newDirName);

				  const images = await convertPDFToImages(pdfPath, newDirName);
				  images.forEach(imagePath => console.log(imagePath));

				  //let testFolder = 'images'
				  const text: string = await createMarkdownFromImages(newDirName); 
				  
				  var newFileName;

				  if(this.settings.mdOutput != '/' && markdownPath == ''){ // if default isnt blank, and the popup is blank, then save it to the default directory
					newFileName = `${this.settings.mdOutput}/${mdFileName}.md`
				  }
				  else if(markdownPath != ''){ // popup directory takes precedence, so if the markdownPath isnt blank, then save it to that location
					newFileName = `${markdownPath}/${mdFileName}.md`
				  }
				  else{ //otherwise, root folder
					newFileName = `${mdFileName}.md`
				  }

				  this.app.vault.create(newFileName, text);

			  }
			  
			});
		});

		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');
		
/* 		this.addCommand({
			id: 'paths-popup',
			name: 'Convert PDF to Markdown with extracted text',
			callback: () => {
				new PathsPopup(this.app, (pdfPath, imagesDirectory, markdownFilePath) => {
					new Notice(`${pdfPath}\n ${imagesDirectory}\n ${markdownFilePath}`);
				  }).open();
			},
		  }); */

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
	private resolve: ((value: [string, string, string]) => void) | null = null;
  
	constructor(app: App) {
	  super(app);
	  this.setTitle('Uni Notes PDF to Markdown');
  
	  let pdfPath = '';
	  new Setting(this.contentEl)
		.setName('PDF Path')
		.addText((text) =>
		  text.onChange((value) => {
			pdfPath = value;
		  }));
  
/* 	  let imagesDirectory = '';
	  new Setting(this.contentEl)
		.setName('Images Output Directory Path')
		.setDesc('You can change this to be the default attachments folder in the settings for this plugin.')
		.addText((text) =>
		  text.onChange((value) => {
			imagesDirectory = value;
		  })); */

		let mdFileName = '';
		new Setting(this.contentEl)
			.setName('Markdown File Name')
			.setDesc('Enter the name of the new Markdown File')
			.addText((text) =>
			  text.onChange((value) => {
				mdFileName = value;
			  }));
  
	  let markdownFilePath = '';
	  new Setting(this.contentEl)
		.setName('Markdown Output Path')
		.setDesc('Use this if you want the file to be saved in a different location from the default.')
		.addText((text) =>
		  text.onChange((value) => {
			markdownFilePath = value;
		  }));
  
	  new Setting(this.contentEl)
		.addButton((btn) =>
		  btn
			.setButtonText('Start')
			.setCta()
			.onClick(() => {
			  this.close();
			  if (this.resolve) {
				this.resolve([pdfPath, markdownFilePath, mdFileName]);
			  }
			}));
	}
  
	openAndGetPaths(): Promise<[string, string, string]> {
	  this.open();
	  return new Promise((resolve) => {
		this.resolve = resolve;
	  });
	}
  }


async function convertPDFToImages(pdfPath: string, outputDir: string, dpi = 300): Promise<string[]> {
		const adapter = this.app.vault.adapter;
		const outputPaths: string[] = [];
	  
		console.log(`Reading PDF from: ${pdfPath}`);
		const pdfData = await adapter.readBinary(normalizePath(pdfPath));
	  
		console.log(`Loading PDF document...`);
		const loadingTask = getDocument({ data: pdfData });
		const pdf = await loadingTask.promise;
	  
		console.log(`PDF loaded, total pages: ${pdf.numPages}`);
	  
		const scale = dpi / 96;
	  
		for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
		  console.log(`Rendering page ${pageNumber}...`);
		  const page = await pdf.getPage(pageNumber);
		  const viewport = page.getViewport({ scale });
	  
		  const canvas = document.createElement("canvas");
		  const context = canvas.getContext("2d")!;
		  canvas.width = viewport.width;
		  canvas.height = viewport.height;
	  
		  await page.render({
			canvas,
			canvasContext: context,
			viewport,
		  }).promise;
	  
		  const dataUrl = canvas.toDataURL("image/png");
		  const base64Data = dataUrl.split(",")[1];
		  const binary = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
	  
		  const pageImagePath = normalizePath(`${outputDir}/page-${pageNumber}.png`);
		  console.log(`Saving page ${pageNumber} image to: ${pageImagePath}`);
		  await adapter.writeBinary(pageImagePath, binary);
	  
		  outputPaths.push(pageImagePath);
		}
	  
		console.log(`All pages rendered and saved.`);
		new Notice("PDF Successfully Converted to Images!")
		return outputPaths;
	  }
	  

async function createMarkdownFromImages(folderPath: string) {
	const imagePaths: string[] = [];

	const files: TFile[] = this.app.vault.getFiles()
		.filter((file: TFile) =>
			file.path.startsWith(folderPath) &&
			file.extension.match(/^(png|jpg|jpeg|gif|webp|svg)$/i)
		)
		.sort((a: TFile, b: TFile) => a.stat.ctime - b.stat.ctime);
	
	
	for (const file of files) {
		console.log(file.name)
		const chosenFile = this.app.vault.getFileByPath(file.path);
		console.log(chosenFile);

		var textTwo;
		
		if (chosenFile) {
			textTwo = await getTextExtractor()?.extractText(chosenFile);
			console.log(textTwo);
		} else {
			textTwo = "Text Extraction Failed"
			console.log("Text Extraction Failed");
			new Notice("Text Extraction Failed!");
		}
	
		imagePaths.push(`![[${folderPath}/${file.name}]]` + '\n' + textTwo + '\n');
	}

	console.log("Generated image markdown:", imagePaths);
	new Notice("Markdown File Successfully created from Images!")
	return imagePaths.join("\n");
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
			.setName('Images Output Location')
			.setDesc('Select where image folders should be created by default. If left blank, folders will be created in the root directory.')
			.addText(text => text
				.setPlaceholder('Enter a valid path')
				.setValue(this.plugin.settings.imageOutput)
				.onChange(async (value) => {
					this.plugin.settings.imageOutput = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Markdown Output Location')
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
