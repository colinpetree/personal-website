const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 80 })
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1280, height: 900 })

  // Login
  await page.goto('http://localhost:5173/admin/login')
  await page.waitForLoadState('networkidle')
  await page.fill('#email', 'admin@example.com')
  await page.fill('#password', 'admin')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/admin/**', { timeout: 5000 })
  console.log('✅ Logged in')

  // Open first blog post
  await page.goto('http://localhost:5173/admin/blog')
  await page.waitForLoadState('networkidle')
  const firstPost = page.locator('a[href*="/admin/blog/"]').first()
  await firstPost.click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)
  console.log('✅ Opened blog post editor')

  // Click editor, go to end, press Enter then /header
  const editor = page.locator('[contenteditable="true"]').first()
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'C:\\Users\\Colin\\AppData\\Local\\Temp\\slash-open.png' })

  await page.keyboard.type('header')
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'C:\\Users\\Colin\\AppData\\Local\\Temp\\slash-header.png' })

  const headerItem = page.locator('text=Header').first()
  const visible = await headerItem.isVisible().catch(() => false)
  console.log(`Header item in slash menu: ${visible}`)

  if (!visible) {
    const menuEl = page.locator('[class*="slash"], [class*="menu"]').first()
    const txt = await menuEl.textContent().catch(() => 'no menu')
    console.log('Menu text:', txt)
    await browser.close()
    process.exit(1)
  }

  await headerItem.click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'C:\\Users\\Colin\\AppData\\Local\\Temp\\header-node-inserted.png' })
  console.log('✅ Header node inserted, cursor moved below')

  // Click the header node (the colored banner)
  const banner = page.locator('input[placeholder="Heading"]').first()
  const bannerVisible = await banner.isVisible().catch(() => false)
  console.log(`Heading input visible: ${bannerVisible}`)

  if (bannerVisible) {
    // Type in heading
    await banner.click()
    await banner.fill('Welcome to My Site')
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'C:\\Users\\Colin\\AppData\\Local\\Temp\\header-typed-heading.png' })
    console.log('✅ Heading typed')

    // Type in subheading
    const sub = page.locator('input[placeholder="Subheading"]').first()
    await sub.click()
    await sub.fill('Building things on the web')
    await page.waitForTimeout(300)
    console.log('✅ Subheading typed')

    // Press Enter to escape back to editor
    await page.keyboard.press('Enter')
    await page.waitForTimeout(400)

    // Click somewhere outside to deselect, then click the banner area to select node
    await page.mouse.click(640, 200)
    await page.waitForTimeout(300)

    // Find the node container and click it (not the input)
    const nodeDiv = page.locator('[style*="background: rgb"]').last()
    if (await nodeDiv.isVisible().catch(() => false)) {
      await nodeDiv.click()
      await page.waitForTimeout(600)
      await page.screenshot({ path: 'C:\\Users\\Colin\\AppData\\Local\\Temp\\header-selected-toolbar.png' })
      console.log('📸 Selected state with toolbar')
    }

    // Test layout toggle — click Wide button (AlignJustify)
    const wideBtn = page.locator('[title*="Wide"], [aria-label*="Wide"]').first()
    if (await wideBtn.isVisible().catch(() => false)) {
      await wideBtn.click()
      await page.waitForTimeout(300)
      console.log('✅ Wide layout toggled')
    }

    // Test Button toggle
    const btnToggle = page.locator('button:has-text("Button: OFF"), button:has-text("Button: ON")').first()
    if (await btnToggle.isVisible().catch(() => false)) {
      await btnToggle.click()
      await page.waitForTimeout(400)
      await page.screenshot({ path: 'C:\\Users\\Colin\\AppData\\Local\\Temp\\header-button-on.png' })
      console.log('✅ Button toggle clicked')
    }
  }

  // Test Enter key on selected node → creates paragraph below
  const nodeContainer = page.locator('[style*="background"]').last()
  await nodeContainer.click()
  await page.waitForTimeout(300)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'C:\\Users\\Colin\\AppData\\Local\\Temp\\header-enter-para.png' })
  console.log('📸 After Enter key — should see cursor below node')

  // Arrow navigation test
  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'C:\\Users\\Colin\\AppData\\Local\\Temp\\header-arrow-up.png' })
  console.log('📸 After ArrowUp — node should be selected')

  await browser.close()
  console.log('✅ All steps completed')
})()
