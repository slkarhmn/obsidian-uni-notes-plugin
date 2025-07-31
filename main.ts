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
		const ribbonIconEl = this.addRibbonIcon('notepad-text-dashed', 'PDF Breakdown', (evt: MouseEvent) => {
			// Called when the user clicks the icon.

			
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		this.addCommand({
			id: 'paths-popup',
			name: 'Convert PDF to Markdown with extracted text',
			callback: () => {
				new PathsPopup(this.app, (result) => {
					new Notice(`Hello, ${result}!`);
				  }).open();
			},
		  });

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
  constructor(app: App, onSubmit: (result: string) => void) {
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
      .addText((text) =>
        text.onChange((value) => {
			imagesDirectory = value;
        }));

	let makrdownFilePath = '';
    new Setting(this.contentEl)
      .setName('Markdown Output Path')
      .addText((text) =>
        text.onChange((value) => {
			makrdownFilePath = value;
        }));

    new Setting(this.contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('Start')
          .setCta()
          .onClick(() => {
            this.close();
            onSubmit(pdfPath);
          }));
  }
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
