import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
const { fromPath } = require("pdf2pic");
const { mkdirsSync, existsSync } = require("fs-extra");
const rimraf = require("rimraf");
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

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
		const ribbonIconEl = this.addRibbonIcon('dice', 'PDF Breakdown', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new FileSelectionModal(this.app).open();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

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


//make a modal open when the button is clicked
class FileSelectionModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

async function convertPdfToImages(pdfPath: string, outputDir: string, dpi = 300) {
	if (!existsSync(pdfPath)) {
	  throw new Error("PDF file not found: " + pdfPath);
	}
  
	const pdfBytes = fs.readFileSync(pdfPath);
	const pdfDoc = await PDFDocument.load(pdfBytes);
	const firstPage = pdfDoc.getPage(0);
	const { width, height } = firstPage.getSize();
	const widthPx = Math.round((width / 72) * dpi);
	const heightPx = Math.round((height / 72) * dpi);
  
	rimraf.sync(outputDir);
	mkdirsSync(outputDir);
  
	const options = {
	  width: widthPx,
	  height: heightPx,
	  density: dpi,
	  savePath: outputDir,
	  format: "png"
	};
  
	const convert = fromPath(pdfPath, options);
	const result = await convert.bulk(-1);
	return result.map((page: { path: any; }, index: number) => ({
	  page: index + 1,
	  path: page.path
	}));
  }
  
  async function startConversion() { 
	const input = "./hash.pdf"; //make this user input
	const output = "./output-images"; //make this user input
  
	try {
	  const pages = await convertPdfToImages(input, output, 300);
	  console.log("Converted pages:");
	  pages.forEach((p: { page: any; path: any; }) => console.log(`Page ${p.page}: ${p.path}`));
	} catch (err) {
	  console.error("Conversion failed:", err.message);
	}
  }

class SampleSettingTab extends PluginSettingTab {
	plugin: PDFBreakdown;

	constructor(app: App, plugin: PDFBreakdown) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
