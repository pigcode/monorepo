/** E2E 公用步骤：通过「创建项目」对话框添加项目。 */
import { expect, type ElectronApplication, type Page } from "@playwright/test"

/**
 * 系统文件夹选择框无法由 Playwright 操作，先在主进程里把它换成直接返回 rootPath，
 * 再走对话框的完整流程：添加项目 → 选择文件夹 → 创建项目。
 */
export async function addProject(
  app: ElectronApplication,
  page: Page,
  rootPath: string,
): Promise<void> {
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [folder],
    })) as unknown as typeof dialog.showOpenDialog
  }, rootPath)
  await page.getByRole("button", { name: "添加项目" }).first().click()
  await page.getByRole("button", { name: "选择文件夹" }).click()
  await expect(page.getByRole("button", { name: `更换文件夹 ${rootPath}` })).toBeVisible()
  await page.getByRole("button", { name: "创建项目", exact: true }).click()
}
