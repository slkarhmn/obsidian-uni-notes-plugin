import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, FileSystemAdapter, TFile, Vault } from 'obsidian';

interface Settings {
	mySetting: string;
}

const DEFAULT_SETTINGS: Settings = {
	mySetting: 'default'
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
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('notepad-text-dashed', 'PDF Breakdown', async (evt: MouseEvent) => {
			// Called when the user clicks the icon

			let folderPath = '';

			const popup = new PathsPopup(this.app);
			popup.openAndGetPaths().then(async ([pdfPath, imagesDir, markdownPath, mdFileName]) => {
			  console.log('PDF Path:', pdfPath);
			  console.log('Images Directory:', imagesDir);
			  console.log('Markdown Path:', markdownPath);
			  console.log('Markdown Path:', mdFileName);

			  folderPath = imagesDir;
			  
			  new Notice(`${pdfPath}\n${imagesDir}\n${markdownPath}`);

			  const adapter = this.app.vault.adapter;

			  if (adapter instanceof FileSystemAdapter) {
				  const vaultRoot = adapter.getBasePath();
				  console.log("Vault is stored at:", vaultRoot);

				  //TODO: Make a regex that checks what the name of the pdf is and then use that to create the newDirName

				  //TODO: newDirName and folderPath are redundant, make it so only one is used, as the images will be stored in a folder with the name of the pdf
				  // then this folder will be passed to createMarkdownFromImages()
				  
				  let newDirName = 'testDir';
			
				  this.app.vault.createFolder(newDirName);
				  
				  const text: string = await createMarkdownFromImages(folderPath);
				  
				  const newFileName = `${mdFileName}.md`
				  this.app.vault.create(newFileName, text);
			  }
			  
			});
		});

		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');


		//TODO: make a command to add the images and text to the currently open note
		
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

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
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

//TODO: Make the files searchable to find files from vault inside the pop up

export class PathsPopup extends Modal {
	private resolve: ((value: [string, string, string, string]) => void) | null = null;
  
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
  
	  let imagesDirectory = '';
	  new Setting(this.contentEl)
		.setName('Images Output Directory Path')
		.setDesc('You can change this to be the default attachments folder in the settings for this plugin.')
		.addText((text) =>
		  text.onChange((value) => {
			imagesDirectory = value;
		  }));

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
		.setDesc('You can change the default output folder in the settings for this plugin')
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
				this.resolve([pdfPath, imagesDirectory, markdownFilePath, mdFileName]);
			  }
			}));
	}
  
	openAndGetPaths(): Promise<[string, string, string, string]> {
	  this.open();
	  return new Promise((resolve) => {
		this.resolve = resolve;
	  });
	}
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
		}
	
		imagePaths.push(`![[${file.name}]]` + '\n' + textTwo + '\n');
	}

	console.log("Generated image markdown:", imagePaths);
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
			.setName('Default Image Output Directory')
			.setDesc('Select where images should be output by default, when no path is entered in the pop up.')
			.addText(text => text
				.setPlaceholder('Enter a valid path')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Markdown Output Location')
			.setDesc('Select where markdown files should be output by default, when no path is entered in the pop up.')
			.addText(text => text
				.setPlaceholder('Enter a valid path')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
