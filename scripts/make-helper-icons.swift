// Draws the icon for the helper app and writes an .icns file:
//   assets/helper-icons/arcify.icns   Vivaldi Arcify
//
//   swift scripts/make-helper-icons.swift
//
// macOS-style rounded square in Vivaldi red, with an SF Symbol and a small
// badge symbol in the corner. Only needed when changing the design: the
// .icns file is committed, and the install scripts copy it in.
import AppKit

let repo = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().deletingLastPathComponent()
let outDir = repo.appendingPathComponent("assets/helper-icons")
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

struct Icon { let name: String; let main: String; let badge: String; let top: NSColor; let bottom: NSColor }
let icons = [
  // Puzzle piece (the mods) with a sync badge (kept in place and in sync).
  Icon(name: "arcify", main: "puzzlepiece.extension.fill", badge: "arrow.triangle.2.circlepath",
       top: NSColor(srgbRed: 0.95, green: 0.33, blue: 0.30, alpha: 1), bottom: NSColor(srgbRed: 0.72, green: 0.13, blue: 0.20, alpha: 1)),
]

func symbol(_ name: String, size: CGFloat, color: NSColor) -> NSImage? {
  let cfg = NSImage.SymbolConfiguration(pointSize: size, weight: .semibold)
    .applying(.init(paletteColors: [color]))
  return NSImage(systemSymbolName: name, accessibilityDescription: nil)?.withSymbolConfiguration(cfg)
}

func draw(_ icon: Icon, px: Int) -> Data {
  let s = CGFloat(px)
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                             samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                             bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  // macOS icon grid: 824/1024 body with ~22.5% corner radius, soft shadow.
  let inset = s * 100 / 1024
  let body = NSRect(x: inset, y: inset * 1.15, width: s - inset * 2, height: s - inset * 2)
  let path = NSBezierPath(roundedRect: body, xRadius: body.width * 0.225, yRadius: body.width * 0.225)
  let shadow = NSShadow()
  shadow.shadowColor = NSColor.black.withAlphaComponent(0.28)
  shadow.shadowBlurRadius = s * 0.025
  shadow.shadowOffset = NSSize(width: 0, height: -s * 0.012)
  NSGraphicsContext.saveGraphicsState()
  shadow.set()
  NSGradient(starting: icon.top, ending: icon.bottom)!.draw(in: path, angle: -90)
  NSGraphicsContext.restoreGraphicsState()
  // A faint top highlight.
  NSGraphicsContext.saveGraphicsState()
  path.addClip()
  NSGradient(starting: NSColor.white.withAlphaComponent(0.18), ending: .clear)!
    .draw(in: NSRect(x: body.minX, y: body.midY, width: body.width, height: body.height / 2), angle: -90)
  NSGraphicsContext.restoreGraphicsState()

  if let m = symbol(icon.main, size: s * 0.36, color: .white) {
    let r = NSRect(x: body.midX - m.size.width / 2 - s * 0.03, y: body.midY - m.size.height / 2 + s * 0.02,
                   width: m.size.width, height: m.size.height)
    m.draw(in: r)
  }
  // Badge: white disc, lower right, with the second symbol in the body colour.
  let d = s * 0.30
  let disc = NSRect(x: body.maxX - d - s * 0.06, y: body.minY + s * 0.06, width: d, height: d)
  NSColor.white.setFill()
  NSBezierPath(ovalIn: disc).fill()
  if let b = symbol(icon.badge, size: d * 0.52, color: icon.bottom) {
    b.draw(in: NSRect(x: disc.midX - b.size.width / 2, y: disc.midY - b.size.height / 2,
                      width: b.size.width, height: b.size.height))
  }
  NSGraphicsContext.restoreGraphicsState()
  return rep.representation(using: .png, properties: [:])!
}

for icon in icons {
  let set = FileManager.default.temporaryDirectory.appendingPathComponent("\(icon.name).iconset")
  try? FileManager.default.removeItem(at: set)
  try! FileManager.default.createDirectory(at: set, withIntermediateDirectories: true)
  for base in [16, 32, 128, 256, 512] {
    try! draw(icon, px: base).write(to: set.appendingPathComponent("icon_\(base)x\(base).png"))
    try! draw(icon, px: base * 2).write(to: set.appendingPathComponent("icon_\(base)x\(base)@2x.png"))
  }
  let out = outDir.appendingPathComponent("\(icon.name).icns")
  let p = Process()
  p.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
  p.arguments = ["-c", "icns", set.path, "-o", out.path]
  try! p.run(); p.waitUntilExit()
  try! draw(icon, px: 512).write(to: outDir.appendingPathComponent("\(icon.name).png"))
  print("wrote", out.path)
}
