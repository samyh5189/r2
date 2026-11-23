import Vision
import CoreImage
import AppKit
let args = CommandLine.arguments
let input = URL(fileURLWithPath: args[1]), output = URL(fileURLWithPath: args[2])
let ci = CIImage(contentsOf: input)!
let handler = VNImageRequestHandler(ciImage: ci)
let req = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([req])
guard let obs = req.results?.first else { print("no subject"); exit(1) }
print("instances:", obs.allInstances.count)
// Pick instances from args[3] (comma list) or all
var set = obs.allInstances
if args.count > 3 { set = IndexSet(args[3].split(separator: ",").map { Int($0)! }) }
let buf = try obs.generateMaskedImage(ofInstances: set, from: handler, croppedToInstancesExtent: true)
let out = CIImage(cvPixelBuffer: buf)
let ctx = CIContext()
try ctx.writePNGRepresentation(of: out, to: output, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
print("size:", out.extent.size)
