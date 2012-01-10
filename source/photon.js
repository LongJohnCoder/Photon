photon.init();
photon.array.pp    = function () { return "photon.array"; };
photon.object.pp   = function () { return "photon.object"; };
photon.function.pp = function () { return "photon.function"; };
photon.global      = photon.send(photon.object, "__new__");
photon.global.pp   = function () { return "photon.global"; };
photon.cell.pp     = function () { return "photon.cell"; };
photon.map.pp      = function () { return "photon.map"; };
photon.symbol.pp   = function () { return "photon.symbol"; };
photon.fixnum.pp   = function () { return "photon.fixnum"; };

var verbose = arguments[1] === "-v"; 

create_handlers();

function _compile(s, print)
{
    if (print === undefined)
    {
        print = function () {};
    }

    function failer (m, idx, f) 
    { 
        print("Matched failed at index " + idx + " on input " + m.input.hd); 
        error(f);
    };

    print("Parsing");
    var ast = PhotonParser.matchAll(s, "topLevel", undefined, failer);
    //print(ast);
    print("Macro Expansion");
    ast = PhotonMacroExp.match(ast, "trans", undefined, failer);
    print("Desugaring");
    ast = PhotonDesugar.match(ast, "trans", undefined, failer);

    //print(PhotonPrettyPrinter.match(ast, "trans"));
    //print(ast);

    print("Variable Analysis");
    PhotonVarAnalysis.match(ast, "trans", undefined, failer);
    print("Variable Scope Binding");
    ast = PhotonVarScopeBinding.match(ast, "trans", undefined, failer);
    print("Pretty Printing");
    //print(ast);
    print(PhotonPrettyPrinter.match(ast, "trans"));

    print("Code Generation");
    var comp = PhotonCompiler.createInstance();
    code = comp.match(ast, "trans", undefined, failer);
    //print("Code: '" + code.length + "'");
    var f = comp.context.new_function_object(code, comp.context.refs, 0);
    f.functions = comp.context.functions;

    return f; 
}


function log(s)
{
    print(s);
}

log("Creating bind function");
photon.bind = photon.send(photon.function, "__new__", 10, 0);
var _bind = photon.bind;
photon.bind = _compile(readFile("_bind.js")).functions["bind"];
photon.send(_bind, "__intern__", 
            clean(_op("mov", _mref(photon.bind), _EAX).concat(_op("jmp", _EAX))));

photon.add_handler = _compile("function add_handler(b,a) { var r = String.prototype.__add__.call(a,b); print(r); return r; }", print).functions["add_handler"];


log("Creating super_bind function");
photon.super_bind = _compile(readFile("super_bind.js")).functions["super_bind"];

log("Installing standard library");
var f = _compile(readFile("photon-stdlib.js"), arguments[1] === "-v" ? print : undefined);
log("Initializing standard library");
photon.send({f:f}, "f");

["stdlib/array.js", 
 "stdlib/string.js", 
 "stdlib/math.js",
 "utility/debug.js", 
 "utility/num.js",
 "utility/misc.js",
 "utility/iterators.js", /*
 "utility/arrays.js", 
 "backend/asm.js", 
 "backend/x86/asm.js", 
 "deps/ometa-js/lib.js",
 "deps/ometa-js/ometa-base.js",
 "deps/ometa-js/parser.js",
 "ometa/photon-compiler.js",
 "photon-lib.js"*/,
 arguments[0]
].forEach(function (s)
{
    try
    {
        log("Compiling '" + s + "'");
        var f = _compile(readFile(s), verbose ? print : undefined);
        log("Executing '" + s + "'");
        photon.send({f:f}, "f");
    } catch(e)
    {
        print(e.stackTrace);
        throw e;
    }
});
