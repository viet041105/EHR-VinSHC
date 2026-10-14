// Advanced reference input remains available for compatibility and administrator workflows.
exports.fillReference = async (page, selector, value) => {
  const input = page.locator(selector);
  for (const parent of await input.locator('xpath=ancestor::details').all()) {
    if (!await parent.evaluate(node => node.open)) await parent.locator(':scope > summary').click();
  }
  await input.fill(value);
};
