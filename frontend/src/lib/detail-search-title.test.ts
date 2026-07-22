import { describe, expect, it } from "vitest";
import { driverSearchTitle, teamSearchTitle } from "./detail-search-title";

describe("detail search titles", () => {
  it("describes an English driver page as WEC results and career stats", () => {
    expect(driverSearchTitle("Kevin Magnussen", "en")).toBe(
      "Kevin Magnussen WEC Results & Career Stats",
    );
  });

  it("localizes a Korean driver search title", () => {
    expect(driverSearchTitle("카무이 코바야시", "ko")).toBe(
      "카무이 코바야시 WEC 기록·결과",
    );
  });

  it("describes an English team page as WEC drivers and results", () => {
    expect(teamSearchTitle("Racing Team Turkey by TF", "en")).toBe(
      "Racing Team Turkey by TF WEC Drivers & Results",
    );
  });

  it("localizes a Korean team search title", () => {
    expect(teamSearchTitle("토요타 가주 레이싱", "ko")).toBe(
      "토요타 가주 레이싱 WEC 드라이버·결과",
    );
  });
});
