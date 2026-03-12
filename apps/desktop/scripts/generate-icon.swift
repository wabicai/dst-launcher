import AppKit
import Foundation

let fileManager = FileManager.default
let scriptURL = URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL
let assetsDir = scriptURL.deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("assets", isDirectory: true)
let iconsetDir = assetsDir.appendingPathComponent("icon.iconset", isDirectory: true)
let masterURL = assetsDir.appendingPathComponent("icon-master.png")
let icnsURL = assetsDir.appendingPathComponent("icon.icns")

let entries: [(name: String, pixels: Int)] = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
]

try? fileManager.removeItem(at: iconsetDir)
try fileManager.createDirectory(at: assetsDir, withIntermediateDirectories: true)
try fileManager.createDirectory(at: iconsetDir, withIntermediateDirectories: true)

for entry in entries {
    let image = drawIcon(size: entry.pixels)
    let url = iconsetDir.appendingPathComponent(entry.name)
    try writePNG(image: image, to: url)
    if entry.pixels == 1024 {
        try writePNG(image: image, to: masterURL)
    }
}

let task = Process()
task.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
task.arguments = ["-c", "icns", iconsetDir.path, "-o", icnsURL.path]
try task.run()
task.waitUntilExit()

if task.terminationStatus != 0 {
    throw NSError(domain: "iconutil", code: Int(task.terminationStatus), userInfo: [NSLocalizedDescriptionKey: "iconutil 执行失败"])
}

try? fileManager.removeItem(at: iconsetDir)
print("Generated icon assets at \(assetsDir.path)")

func drawIcon(size: Int) -> NSImage {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocusFlipped(false)

    let rect = NSRect(x: 0, y: 0, width: size, height: size)
    let radius = CGFloat(size) * 0.23
    let backgroundPath = NSBezierPath(roundedRect: rect.insetBy(dx: CGFloat(size) * 0.03, dy: CGFloat(size) * 0.03), xRadius: radius, yRadius: radius)

    NSColor(calibratedRed: 0.03, green: 0.05, blue: 0.10, alpha: 1).setFill()
    backgroundPath.fill()

    let gradient = NSGradient(colors: [
        NSColor(calibratedRed: 0.10, green: 0.16, blue: 0.28, alpha: 1),
        NSColor(calibratedRed: 0.03, green: 0.05, blue: 0.10, alpha: 1),
    ])
    gradient?.draw(in: backgroundPath, angle: 285)

    let glowCenter = NSPoint(x: rect.midX, y: rect.midY + CGFloat(size) * 0.08)
    let glowColor = NSColor(calibratedRed: 1.0, green: 0.63, blue: 0.18, alpha: 0.22).cgColor
    if let context = NSGraphicsContext.current?.cgContext {
        let colors = [glowColor, NSColor.clear.cgColor] as CFArray
        let space = CGColorSpaceCreateDeviceRGB()
        let locations: [CGFloat] = [0.0, 1.0]
        if let radial = CGGradient(colorsSpace: space, colors: colors, locations: locations) {
            context.drawRadialGradient(radial, startCenter: glowCenter, startRadius: 0, endCenter: glowCenter, endRadius: CGFloat(size) * 0.45, options: .drawsAfterEndLocation)
        }
    }

    drawControlRing(in: rect)
    drawFlame(in: rect)

    image.unlockFocus()
    return image
}

func drawControlRing(in rect: NSRect) {
    let ringRect = rect.insetBy(dx: rect.width * 0.18, dy: rect.height * 0.18)
    let ringWidth = rect.width * 0.075
    let segments: [(CGFloat, CGFloat, NSColor)] = [
        (220, 326, NSColor(calibratedRed: 1.0, green: 0.76, blue: 0.30, alpha: 0.96)),
        (18, 120, NSColor(calibratedRed: 0.99, green: 0.47, blue: 0.12, alpha: 0.9)),
        (142, 194, NSColor(calibratedRed: 0.52, green: 0.79, blue: 0.94, alpha: 0.55)),
    ]

    for segment in segments {
        let path = NSBezierPath()
        path.appendArc(withCenter: NSPoint(x: ringRect.midX, y: ringRect.midY), radius: ringRect.width / 2, startAngle: segment.0, endAngle: segment.1, clockwise: false)
        path.lineWidth = ringWidth
        path.lineCapStyle = .round
        segment.2.setStroke()
        path.stroke()
    }

    let innerGlow = NSBezierPath(ovalIn: rect.insetBy(dx: rect.width * 0.31, dy: rect.height * 0.31))
    NSColor(calibratedRed: 0.97, green: 0.74, blue: 0.24, alpha: 0.14).setStroke()
    innerGlow.lineWidth = rect.width * 0.03
    innerGlow.stroke()
}

func drawFlame(in rect: NSRect) {
    let scale = rect.width / 1024.0
    let flame = NSBezierPath()
    flame.move(to: NSPoint(x: 521 * scale, y: 790 * scale))
    flame.curve(to: NSPoint(x: 690 * scale, y: 518 * scale), controlPoint1: NSPoint(x: 655 * scale, y: 708 * scale), controlPoint2: NSPoint(x: 748 * scale, y: 618 * scale))
    flame.curve(to: NSPoint(x: 526 * scale, y: 228 * scale), controlPoint1: NSPoint(x: 642 * scale, y: 380 * scale), controlPoint2: NSPoint(x: 626 * scale, y: 282 * scale))
    flame.curve(to: NSPoint(x: 335 * scale, y: 492 * scale), controlPoint1: NSPoint(x: 400 * scale, y: 271 * scale), controlPoint2: NSPoint(x: 287 * scale, y: 364 * scale))
    flame.curve(to: NSPoint(x: 521 * scale, y: 790 * scale), controlPoint1: NSPoint(x: 345 * scale, y: 626 * scale), controlPoint2: NSPoint(x: 433 * scale, y: 730 * scale))
    flame.close()

    let gradient = NSGradient(colors: [
        NSColor(calibratedRed: 1.0, green: 0.91, blue: 0.56, alpha: 1),
        NSColor(calibratedRed: 1.0, green: 0.62, blue: 0.19, alpha: 1),
        NSColor(calibratedRed: 0.88, green: 0.27, blue: 0.06, alpha: 1),
    ])
    gradient?.draw(in: flame, angle: 90)

    let ember = NSBezierPath()
    ember.move(to: NSPoint(x: 510 * scale, y: 640 * scale))
    ember.curve(to: NSPoint(x: 598 * scale, y: 500 * scale), controlPoint1: NSPoint(x: 585 * scale, y: 614 * scale), controlPoint2: NSPoint(x: 634 * scale, y: 556 * scale))
    ember.curve(to: NSPoint(x: 520 * scale, y: 354 * scale), controlPoint1: NSPoint(x: 572 * scale, y: 428 * scale), controlPoint2: NSPoint(x: 562 * scale, y: 376 * scale))
    ember.curve(to: NSPoint(x: 438 * scale, y: 505 * scale), controlPoint1: NSPoint(x: 470 * scale, y: 390 * scale), controlPoint2: NSPoint(x: 420 * scale, y: 438 * scale))
    ember.curve(to: NSPoint(x: 510 * scale, y: 640 * scale), controlPoint1: NSPoint(x: 440 * scale, y: 570 * scale), controlPoint2: NSPoint(x: 474 * scale, y: 622 * scale))
    ember.close()

    let emberGradient = NSGradient(colors: [
        NSColor(calibratedRed: 0.16, green: 0.07, blue: 0.03, alpha: 1),
        NSColor(calibratedRed: 0.48, green: 0.15, blue: 0.02, alpha: 1),
    ])
    emberGradient?.draw(in: ember, angle: 90)

    let spark = NSBezierPath(ovalIn: NSRect(x: 476 * scale, y: 668 * scale, width: 82 * scale, height: 82 * scale))
    NSColor(calibratedRed: 1.0, green: 0.94, blue: 0.72, alpha: 0.92).setFill()
    spark.fill()
}

func writePNG(image: NSImage, to url: URL) throws {
    guard let tiffData = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiffData),
          let pngData = bitmap.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "png", code: 1, userInfo: [NSLocalizedDescriptionKey: "PNG 导出失败"])
    }

    try pngData.write(to: url)
}
