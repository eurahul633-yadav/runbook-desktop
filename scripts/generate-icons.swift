// Rebuild Runbook icons on macOS: swift scripts/generate-icons.swift
import AppKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let fm = FileManager.default
func color(_ hex: UInt32) -> CGColor {
    CGColor(red: CGFloat((hex >> 16) & 255) / 255,
            green: CGFloat((hex >> 8) & 255) / 255,
            blue: CGFloat(hex & 255) / 255, alpha: 1)
}
func png(_ size: Int) -> Data {
    let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
                        bytesPerRow: size * 4, space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.scaleBy(x: CGFloat(size) / 1024, y: CGFloat(size) / 1024)
    ctx.translateBy(x: 0, y: 1024)
    ctx.scaleBy(x: 1, y: -1)
    func rounded(_ rect: CGRect, _ radius: CGFloat, _ fill: CGColor) {
        ctx.setFillColor(fill)
        ctx.addPath(CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil))
        ctx.fillPath()
    }
    ctx.saveGState()
    ctx.addPath(CGPath(roundedRect: CGRect(x: 64, y: 64, width: 896, height: 896), cornerWidth: 200, cornerHeight: 200, transform: nil))
    ctx.clip()
    let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [color(0x8B5CF6), color(0x4338CA), color(0x312E81)] as CFArray, locations: [0, 0.58, 1])!
    ctx.drawLinearGradient(gradient, start: CGPoint(x: 140, y: 90), end: CGPoint(x: 890, y: 950), options: [])
    ctx.restoreGState()
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: 14), blur: 28, color: CGColor(gray: 0, alpha: 0.20))
    rounded(CGRect(x: 292, y: 240, width: 440, height: 572), 48, color(0xF5F3FF))
    ctx.restoreGState()
    rounded(CGRect(x: 416, y: 210, width: 192, height: 82), 25, color(0xC4B5FD))
    rounded(CGRect(x: 459, y: 235, width: 106, height: 20), 10, color(0x6D5BD0))
    ctx.setLineCap(.round)
    ctx.setLineJoin(.round)
    func stroke(_ points: [CGPoint], _ width: CGFloat, _ ink: UInt32) {
        ctx.setStrokeColor(color(ink)); ctx.setLineWidth(width)
        ctx.beginPath(); ctx.move(to: points[0])
        for point in points.dropFirst() { ctx.addLine(to: point) }
        ctx.strokePath()
    }
    for y in [378.0, 478.0, 578.0] {
        stroke([CGPoint(x: 353, y: y), CGPoint(x: 373, y: y + 20), CGPoint(x: 407, y: y - 18)], 19, 0x7C3AED)
        stroke([CGPoint(x: 464, y: y + 1), CGPoint(x: 653, y: y + 1)], 19, 0x6153A8)
    }
    stroke([CGPoint(x: 437, y: 681), CGPoint(x: 401, y: 715), CGPoint(x: 437, y: 749)], 18, 0x4338CA)
    stroke([CGPoint(x: 531, y: 672), CGPoint(x: 493, y: 758)], 18, 0x7C3AED)
    stroke([CGPoint(x: 587, y: 681), CGPoint(x: 623, y: 715), CGPoint(x: 587, y: 749)], 18, 0x4338CA)
    let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
    return rep.representation(using: .png, properties: [:])!
}
func write(_ file: String, _ data: Data) throws {
    let url = root.appendingPathComponent(file)
    try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: url)
}
try write("build/icon.png", png(1024))
for size in [16, 32, 64, 128, 256, 512] {
    try write("build/icon/icon-\(size)x\(size).png", png(size))
}
let iconset = fm.temporaryDirectory.appendingPathComponent("runbook-\(UUID().uuidString).iconset")
try fm.createDirectory(at: iconset, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    try png(size).write(to: iconset.appendingPathComponent("icon_\(size)x\(size).png"))
    try png(size * 2).write(to: iconset.appendingPathComponent("icon_\(size)x\(size)@2x.png"))
}
let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
process.arguments = ["-c", "icns", iconset.path, "-o", root.appendingPathComponent("build/icon.icns").path]
try process.run(); process.waitUntilExit()
precondition(process.terminationStatus == 0, "iconutil failed")
// Modern ICO files contain PNG frames at multiple resolutions.
func le(_ value: Int, _ bytes: Int) -> Data {
    Data((0..<bytes).map { UInt8((value >> ($0 * 8)) & 255) })
}
let sizes = [16, 32, 48, 64, 128, 256]
let frames = sizes.map { png($0) }
var ico = le(0, 2) + le(1, 2) + le(sizes.count, 2)
var offset = 6 + 16 * sizes.count
for (size, frame) in zip(sizes, frames) {
    ico += Data([UInt8(size == 256 ? 0 : size), UInt8(size == 256 ? 0 : size), 0, 0])
    ico += le(1, 2) + le(32, 2) + le(frame.count, 4) + le(offset, 4)
    offset += frame.count
}
for frame in frames { ico += frame }
try write("build/icon.ico", ico)
// Preserve existing MSIX asset names and pixel dimensions.
for name in try fm.contentsOfDirectory(atPath: root.appendingPathComponent("build/msix-assets").path) where name.hasSuffix(".png") {
    let file = "build/msix-assets/" + name
    let rep = NSBitmapImageRep(data: try Data(contentsOf: root.appendingPathComponent(file)))!
    precondition(rep.pixelsWide == rep.pixelsHigh)
    try write(file, png(rep.pixelsWide))
}
print("Generated Runbook PNG, ICNS, ICO and MSIX assets; iconset retained at \(iconset.path)")
