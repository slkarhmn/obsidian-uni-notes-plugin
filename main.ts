import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, FileSystemAdapter, TFile } from 'obsidian';

interface Settings {
	mySetting: string;
}

const DEFAULT_SETTINGS: Settings = {
	mySetting: 'default'
}

export default class PDFBreakdown extends Plugin {
	settings: Settings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('notepad-text-dashed', 'PDF Breakdown', (evt: MouseEvent) => {
			// Called when the user clicks the icon.

			const adapter = this.app.vault.adapter;

			if (adapter instanceof FileSystemAdapter) {
				const vaultRoot = adapter.getBasePath();
				console.log("Vault is stored at:", vaultRoot);
				let folderPath = '';

				const text: string = createMarkdownFromImages(folderPath);

				//TODO: make it so each pdf to images conversion creates a new folder in the attachments folder
				//this folder is the one passed to createMarkdownFromImages();
				this.app.vault.create('test.md', text);
			}

			const popup = new PathsPopup(this.app);
			popup.openAndGetPaths().then(([pdfPath, imagesDir, markdownPath]) => {
			  console.log('PDF Path:', pdfPath);
			  console.log('Images Directory:', imagesDir);
			  console.log('Markdown Path:', markdownPath);
			  
			  new Notice(`${pdfPath}\n${imagesDir}\n${markdownPath}`);
			  
			});

			

		});

		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		//TODO: make this add the images and text to the currently open note
		
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


export class PathsPopup extends Modal {
	private resolve: ((value: [string, string, string]) => void) | null = null;
  
	constructor(app: App) {
	  super(app);
	  this.setTitle('PDF Breakdown');
  
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
				this.resolve([pdfPath, imagesDirectory, markdownFilePath]);
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

  function createMarkdownFromImages(folderPath: string) {
	const imagePaths: string[] = [];

	const files: TFile[] = this.app.vault.getFiles().filter((file: TFile) =>
		file.path.startsWith(folderPath)
	);

	for (let i = 0; i < files.length; i++) {
		const file = files[i];

		if (file.extension.match(/^(png|jpg|jpeg|gif|webp|svg)$/i)) {
			imagePaths.push(`![[${file.name}]]`);
		}
	}

	console.log("Generated image markdown:", imagePaths);
	return imagePaths.join("\n");
}


class SettingsTab extends PluginSettingTab {
	plugin: PDFBreakdown;

	constructor(app: App, plugin: PDFBreakdown) {
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
