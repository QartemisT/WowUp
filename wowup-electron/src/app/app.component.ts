import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
} from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
import { TranslateService } from "@ngx-translate/core";
import { from } from "rxjs";
import { switchMap } from "rxjs/operators";
import { join, dirname } from "path";
import { CREATE_TRAY_MENU_CHANNEL } from "../common/constants";
import { SystemTrayConfig } from "../common/wowup/system-tray-config";
import { TelemetryDialogComponent } from "./components/telemetry-dialog/telemetry-dialog.component";
import { ElectronService } from "./services";
import { AddonService } from "./services/addons/addon.service";
import { AnalyticsService } from "./services/analytics/analytics.service";
import { FileService } from "./services/files/file.service";
import { WarcraftService } from "./services/warcraft/warcraft.service";
import { WowUpService } from "./services/wowup/wowup.service";

const AUTO_UPDATE_PERIOD_MS = 60 * 60 * 1000; // 1 hour

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements AfterViewInit {
  private _autoUpdateInterval?: number;
  private _languageList: string[] = [];

  constructor(
    private _analyticsService: AnalyticsService,
    private _electronService: ElectronService,
    private _fileService: FileService,
    private translate: TranslateService,
    private warcraft: WarcraftService,
    private _wowUpService: WowUpService,
    private _dialog: MatDialog,
    private _addonService: AddonService
  ) {
    this._fileService
      .listFiles("./src/assets/i18n/", "*.json")
      .forEach((items) => {
        this._languageList.push(items.split(".")[0]);
      });
    this.translate.addLangs(this._languageList);
    this.translate.setDefaultLang("en");
    this.translate.use(this._wowUpService.currentLanguage);
  }

  ngAfterViewInit(): void {
    this.createSystemTray();

    if (this._analyticsService.shouldPromptTelemetry) {
      this.openDialog();
    } else {
      this._analyticsService.trackStartup();
    }

    this.onAutoUpdateInterval();
    this._autoUpdateInterval = window.setInterval(
      this.onAutoUpdateInterval,
      AUTO_UPDATE_PERIOD_MS
    );
  }

  openDialog(): void {
    const dialogRef = this._dialog.open(TelemetryDialogComponent, {
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      this._analyticsService.telemetryEnabled = result;
      if (result) {
        this._analyticsService.trackStartup();
      }
    });
  }

  private onAutoUpdateInterval = async () => {
    console.debug("Auto update");
    const updateCount = await this._addonService.processAutoUpdates();

    if (updateCount === 0) {
      return;
    }

    const iconPath = await this._fileService.getAssetFilePath(
      "wowup_logo_512np.png"
    );

    if (this._wowUpService.enableSystemNotifications) {
      this._electronService.showNotification(
        this.translate.instant("APP.AUTO_UPDATE_NOTIFICATION_TITLE"),
        {
          body: this.translate.instant("APP.AUTO_UPDATE_NOTIFICATION_BODY", {
            count: updateCount,
          }),
          icon: iconPath,
        }
      );
    }
  };

  private async createSystemTray() {
    const result = await this.translate
      .get(["APP.SYSTEM_TRAY.QUIT_ACTION", "APP.SYSTEM_TRAY.SHOW_ACTION"])
      .toPromise();

    console.debug("Creating tray", result);
    const config: SystemTrayConfig = {
      quitLabel: result["APP.SYSTEM_TRAY.QUIT_ACTION"],
      showLabel: result["APP.SYSTEM_TRAY.SYSTEM_TRAY"],
    };

    try {
      const trayCreated = await this._electronService.invoke(
        CREATE_TRAY_MENU_CHANNEL,
        config
      );
      console.log("Tray created", trayCreated);
    } catch (e) {
      console.error("Failed to create tray", e);
    }
  }
}
