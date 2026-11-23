// blankplate <in.png> <out.png> x0 y0 x1 y1 — paint the plate's lettering out with its own background colour.
import Foundation; import CoreGraphics; import ImageIO; import UniformTypeIdentifiers
let a = CommandLine.arguments
let img = CGImageSourceCreateImageAtIndex(CGImageSourceCreateWithURL(URL(fileURLWithPath: a[1]) as CFURL, nil)!, 0, nil)!
let w = img.width, h = img.height
var px = [UInt8](repeating: 0, count: w * h * 4)
let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
let x0 = Int(a[3])!, y0 = Int(a[4])!, x1 = Int(a[5])!, y1 = Int(a[6])!
// Plate background = median of the darker half of pixels in the box (the lettering is the light half).
var lum: [(Double, Int)] = []
for y in y0..<y1 { for x in x0..<x1 { let i = (y * w + x) * 4; lum.append((Double(px[i]) + Double(px[i+1]) + Double(px[i+2]), i)) } }
lum.sort { $0.0 < $1.0 }
let mid = lum[lum.count / 25].1
let bg = (px[mid], px[mid+1], px[mid+2])
for y in y0..<y1 { for x in x0..<x1 {
  // Soft edge (3 px) so it blends into the frame.
  let e = Double(min(x - x0, x1 - 1 - x, y - y0, y1 - 1 - y)); let t = min(1, (e + 1) / 3)
  let i = (y * w + x) * 4
  px[i] = UInt8(Double(px[i]) * (1 - t) + Double(bg.0) * t); px[i+1] = UInt8(Double(px[i+1]) * (1 - t) + Double(bg.1) * t); px[i+2] = UInt8(Double(px[i+2]) * (1 - t) + Double(bg.2) * t)
} }
let dst = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[2]) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dst, ctx.makeImage()!, nil); CGImageDestinationFinalize(dst); print("ok", bg)
