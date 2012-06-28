photon.protocol = {
    base_arg_nb:3
};


var gensym = (function ()
{
    var i = 0;

    return function () { return "$_" + i++; };

})();


function _asm(code)
{
    var a = new (x86.Assembler)(x86.target.x86);

    if (code !== undefined) a.codeBlock.code = code;

    return a;
}

function _assemble(code)
{
    var codeBlock = _asm(flatten(code)).codeBlock;
    codeBlock.assemble();
    code = clean(codeBlock.code);
    return code;
}

function flatten(code)
{
    function helper(code)
    {
        for (var i = 0; i < code.length; ++i)
        {
            if (code[i] instanceof Array)
            {
                helper(code[i]);
            } else
            {
                a.push(code[i]);
            }
        }
    }

    var a = [];

    helper(code);

    return a;
}

function clean(code)
{
    var a = [];

    for (var i = 0; i < code.length; ++i)
    {
        if (typeof code[i] === "number")
        {
            a.push(code[i]);
        }
    }

    return a;
}

function addr_to_num(addr)
{
    var n = 0;

    for (var i = addr.length - 1; i >= 0; --i)
    {
        n = num_shift(n,8);
        n = num_add(n, addr[i]);
    }

    return n;
}

const _reg         = x86.Assembler.prototype.register;
const _ESP         = _reg.esp;
const _EBP         = _reg.ebp;
const _EAX         = _reg.eax;
const _EBX         = _reg.ebx;
const _ECX         = _reg.ecx;
const _EDX         = _reg.edx;
const _$           = x86.Assembler.prototype.immediateValue;
const _mem         = x86.Assembler.prototype.memory;
const _label       = asm.CodeBlock.prototype.label;
const _listing     = asm.CodeBlock.prototype.listing;
const _deferred    = asm.CodeBlock.prototype.deferred;
const _lbl_listing = function (label) { return _listing(label.id + ":"); };
const _FALSE       = 4;
const _NIL         = 2;
const _TRUE        = 6;
const _UNDEFINED   = 0;

var _op;
(function () {
    var a = new (x86.Assembler)(x86.target.x86);

    _op = function (op, op0, op1, op2, op3, op4)
    {
        a.codeBlock.code = [];

        if (op0 === undefined)
        {
            a[op]();
        } else if (op1 === undefined)
        {
            a[op](op0);
        } else if (op2 === undefined)
        {
            a[op](op0, op1);
        } else if (op3 === undefined)
        {
            a[op](op0, op1, op2);
        } else if (op4 === undefined)
        {
            a[op](op0, op1, op2, op3);
        } else 
        {
            throw "Invalid _op number of arguments";
            //var args = Array.prototype.slice.call(arguments, 1);
            //a[op].apply(a, args);
        }
        return a.codeBlock.code;
    }
})();

function _ref(n)
{
    return (n * 2) + 1;
}

function _fx(n)
{
    return (n - 1) / 2; 
}

function _mref(m)
{
    assert((typeof m) === "object" && m.__addr__ !== undefined)
    return _$(addr_to_num(m.__addr_bytes__()));
}

function _deep_copy(o)
{
    if (o instanceof Array)
    {
        var new_a = [];

        for (var i = 0; i < o.length; ++i)
        {
            new_a.push(_deep_copy(o[i]));
        }

        return new_a;
    } else if (o instanceof Object)
    {
        var new_o = {};

        for (var p in o)
        {
            if (o.hasOwnProperty(p))
            {
                new_o[p] = _deep_copy(o[p]);
            }
            new_o.__proto__ = o.__proto__;
        }

        return new_o;
    } else 
    {
        return o;
    }
}

function _new_context()
{
    return {
        scope:null,
        name:undefined
    };
}

// Variable analysis data structures

function scope(p)
{
    var that = Object.create(scope.prototype);

    // Primary fields
    that.declared = {};
    that.used     = {};
    that.parent   = p;
    that.children = [];
    that.useArguments = false;

    if (p !== null)
    {
        p.children.push(that);
    }
    
    // Derived fields
    that._escaping  = {}; // Local vars captured by children scopes
    that._captured  = {}; // Captured from parent scope
    that._local     = [];

    return that;
}

scope.prototype.resolve = function ()
{
    function bind(id, scope)
    {
        var v = scope.declared[id];

        if (v !== undefined)
        {
            return v;
        } else if (scope.parent === null)
        {
            scope.declare(id, false);
            return bind(id, scope);
        }

        v = bind(id, scope.parent);

        if (!v.is_global())
        {
            v.scope._escaping[id] = v;        

            if (!(scope instanceof let_scope))
            {
                scope._captured[id]   = v;
            }
        }     

        return v;
    }

    for (var id in this.used)
    {
        this.used[id] = bind(id, this);
    }

    for (var i = 0; i < this.children.length; ++i)
    {
        var c = this.children[i];

        c.resolve();
    }

    for (var id in this.declared)
    {
        var v = this.declared[id];
        if (v.is_local() && !v.isParam)
        {
            this._local.push(v);
        }

        if (this.useArguments && v.isParam)
        {
            this._escaping[id] = v; 
        }
    }
};

scope.prototype.toString = function ()
{
    var that = this;
    var a = [];

    function stringify_set(scope, set_name)
    {
        a.push(set_name + ": {");
        
        for (var id in scope[set_name])
        {
            a.push(scope[set_name][id] + ",");
        }
        a.push("}\n");
    }

    function stringify_scope(scope)
    {
        stringify_set(scope, "declared");
        stringify_set(scope, "used");

        a.push("local: " + scope._local + "\n");
        stringify_set(scope, "_escaping");
        stringify_set(scope, "_captured");
    }

    function traverse(scope, perform)
    {
        a.push("\n");
        perform(scope);

        for (var i = 0; i < scope.children.length; ++i)
        {
            traverse(scope.children[i], perform);
        }
    }

    traverse(this, stringify_scope);

    return a.join('');
};

scope.prototype.use = function (id)
{
    if (this.used[id] === undefined)
    {
        this.used[id] = true;
    }
};

scope.prototype.declare = function (id, isParam)
{
    if (id === undefined)
    {
        var v = undefined;
    } else
    {
        var v = this.declared[id];
    }

    if (v === undefined)
    {
        var v = variable(this, id, isParam);    
        this.declared[v.id] = v;
    }

    return v;
};

scope.prototype.lookup = function (id)
{
    var v = this.used[id];

    if (v === undefined)
    {
        v = this.declared[id];
        if (v === undefined) 
        {
            return this.captured(id);
        }
    }
    return v;
};

scope.prototype.escaping = function (id)
{
    if (id === undefined)
    {
        return this._escaping;
    }

    return this._escaping[id];
};

scope.prototype.local = function ()
{
    return this._local;    
};

scope.prototype.captured = function (id)
{
    if (id === undefined)
    {
        return this._captured;
    }

    return this._captured[id];
};

scope.prototype.set_use_arguments = function ()
{
    this.useArguments = true;
}

function let_scope(p, names)
{
    var that = Object.create(let_scope.prototype);

    // Primary fields
    that.declared = {};
    that.used     = {};
    that.parent   = p;
    that.children = [];

    var d = p;
    while (d instanceof let_scope)
    {
        d = d.parent;
    }
    that.delegate = d;

    for (var i = 0; i < names.length; ++i)
    {
        that.declared[names[i]] = variable(that, names[i], false);
    }

    if (p !== null)
    {
        p.children.push(that);
    }
    
    // Derived fields
    that._escaping  = {}; // Local vars captured by children scopes
    that._captured  = {}; // Captured from parent scope
    that._local     = [];

    return that;
}

let_scope.prototype = scope(null);

let_scope.prototype.use = function (id)
{
    if (this.declared[id] === undefined)
    {
        this.parent.use(id);
    } else
    {
        this.used[id] = this.declared[id];
    }
};

let_scope.prototype.escaping = function (id)
{
    var that = this;
    function traverse(s)
    {
        if (s === that.delegate)
        {
            return Object.create(this.delegate.escaping());
        } else
        {
            var e = traverse(that.parent);
            for (var id in this._escaping)
            {
                e[id] = this._escaping[id];
            }
            return e;
        }
    }
    if (id === undefined)
    {
        return traverse(this); 
    }

    var v = this._escaping[id];

    if (v === undefined)
    {
        var v2 = this.parent.escaping(id);
        return v2;
    } else
    {
        return v;
    }
};

let_scope.prototype.captured = function (id)
{
    if (id === undefined)
    {
        return Object.create(this.delegate.captured());
    }

    var v = this._captured[id];

    if (v === undefined)
    {
        return this.delegate.captured(id);
    } else
    {
        return v;
    }
};

let_scope.prototype.local = function ()
{
    var l = [];

    var local = this.delegate.local();

    for (var i = 0; i < local.length; ++i)
    {
        l.push(local[i]);
    }

    for (var i = 0; i < this._local.length; ++i)
    {
        l.push(this._local[i]);
    }

    return l;
};

let_scope.prototype.declare = function (id, isParam)
{
    return this.delegate.declare(id, isParam);
};

let_scope.prototype.lookup = function (id)
{
    var v = this.used[id];    

    if (v === undefined)
    {
        v = this.declared[id];

        if (v === undefined)
        {
            return this.parent.lookup(id);
        }
    }

    return v;
};

let_scope.prototype.set_use_arguments = function ()
{
    this.delegate.set_use_arguments();
};

function variable(scope, id, isParam)
{
   var that = Object.create(variable.prototype); 

   if (isParam === undefined)
   {
        isParam = false;
   }

   if (id === undefined)
   {
       id = variable.next_id++;
       that.id = "#" + id;
   } else 
   {
       that.id = id;
   }

   that.isParam = isParam;
   that.scope   = scope;

   return that;
}

// Global state
variable.next_id = 0;

variable.prototype.is_local = function ()
{
    return this.scope.declared[this.id] === this && 
           this.scope.escaping(this.id) === undefined &&
           this.scope.parent !== null;
};

variable.prototype.is_global = function ()
{
    return this.scope.parent === null;
};

variable.prototype.toString = function ()
{
    return (this.isParam ? "arg " : "var ") + this.id;
};

function local_let_scope(p, names)
{
    var that = let_scope(p, names);

    for (var id in that.declared)
    {
        that._local.push(that.declared[id]);
    }

    return that;
}


function subr(code)
{
    code = flatten(code);
    var codeBlock = _asm(code).codeBlock;
    codeBlock.assemble();
    //print(codeBlock.listingString());

    code = clean(codeBlock.code);
    var length = code.length;

    var f = photon.send(photon["function"], "__new__", length, 0);
    photon.send(f, "__intern__", code);

    return f;
}

function create_handlers()
{
    var LOOP = _label("LOOP");
    var INIT = _label("INIT");
    photon.variadic_enter = subr(
    [
        // Initialize stack to new position
        _op("mov", _mem(4, _ESP), _EAX),  // Retrieve expected nb of args
        _op("sub", _mem(16, _ESP), _EAX), // Substract received nb of args
        _op("sal", _$(2), _EAX),          // Multiply by 4 to get the number of bytes
        _op("mov", _ESP, _ECX),           // Obtain a pointer to current stack 
        _op("sub", _EAX, _ESP),           // Reserve extra space for missing args
        _op("and", _$(-16), _ESP),        // Align new stack position ***

        // Move stack from old to new position
        _op("mov", _$(0), _EAX),          // Initialize counter
        _op("mov", _mem(16, _ECX), _EBP), // Retrieve the number of args
        _op("add", _$(7), _EBP),          // Also copy values under args 
        LOOP,
        _op("mov", _mem(0, _ECX, _EAX, 4), _EDX), // Retrieve current value
        _op("mov", _EDX, _mem(0, _ESP, _EAX, 4)), // Move to new position
        _op("inc", _EAX),                         // Next value
        _op("cmp", _EBP, _EAX),      
        _op("jl", LOOP),                          // Loop while there are remaining values

        // Initialize extraneous arguments to undefined
        _op("sub", _$(7), _EBP),          // Retrieve the received nb of args
        _op("mov", _mem(4, _ESP), _EAX),  // Retrieve the expected nb of args
        INIT,
        _op("mov", _$(_UNDEFINED), _mem(28, _ESP, _EBP, 4), 32), // Store 'undefined' for current value
        _op("inc", _EBP),
        _op("cmp", _EAX, _EBP),
        _op("jl", INIT),

        _op("ret")
    ]);

    photon.variadic_exit = subr(
    [
        _op("mov", _mem(8, _EBP), _ECX), // Compute extraneous arg nb
        _op("sub", _EDX, _ECX),
        _op("sal", _$(2), _ECX),         // Obtain the adjustment in bytes
        _op("and", _$(-16), _ECX),       // Reverse alignment
        _op("mov", _EBP, _ESP),          // Restore stack 
        _op("pop", _EBP),
        _op("pop", _EDX),                // Retrieve return address
        _op("sub", _ECX, _ESP),          // Remove extra args
        _op("jmp", _EDX)                 // Return
    ]);

    // ***: Alignment is valid since 4 values of 4 bytes each are on top of the 
    // stack frame
}

// Compiler context for stateful code generation from AST
PhotonCompiler.context = {   
    init:function ()
    {
        var that = Object.create(this);

        // Maintain a set of functions created during compilation
        that.functions = {};

        // Compiler constants
        that.sizeof_ref    = photon.send(photon.object, "__ref_size__");
        that.sizeof_header = photon.send(photon.object, "__header_size__");

        // Offsets of this and closure parameters from frame pointer
        that.arg_nb_offset = 8;
        that.this_offset   = 12;
        that.clos_offset   = 16;

        // Maintain the current block labels for changes of control flow
        that.block  = {};
        that.previous_blocks = [];

        // Maintain the current scope and associated variables
        that.scope = null;
        that.previous_scopes = [];

        // Maintain the offset of variables compared to their base pointers
        that.stack_offsets    = null;
        that.previous_offsets = [];

        // Maintain the list of labels associated to
        // references in the function code
        that.refs   = null;
        that.previous_refs = [];

        // Displacement of the frame pointer from its base position
        // in the function scope
        that.bias = 0;
        that.previous_biases = [];

        // Number of locations on the stack used
        that.stack_location_nb = 0;
        that.previous_stack_location_nb = [];

        // Nesting level of try
        that.try_lvl = 0;
        that.previous_try_lvls = [];

        // Current argument number
        that.arg_nb = 0;
        that.previous_arg_nb = [];

        // Deferred code
        that.deferred = null;
        that.previous_deferred = [];

        return that;
    },
    
    defer:function (code)
    {
         this.deferred.push(code);
    },
    
    deferred_insert:function (a)
    {
        for (var i=0; i<this.deferred.length; i++)
            a.codeBlock.extend(this.deferred[i]);
        this.deferred = [];
    },

    cache_position:function (offset)
    {
        return _deferred(
            [function () { return 4; }], 
            [function (cb, pos) { cb.gen32(pos+offset).
                                     genListing("(data) FN_PTR_OFFSET");}]
        );
    },

    magic_cookie:function ()
    {
        return _deferred(
            [function () { return 6; }], 
            [function (cb, pos) { cb.gen8(0x81).gen8(0xd1).gen32(pos).
                                     genListing("adcl $FN_PTR_OFFSET,%ecx // Magic Cookie");}]
        );
    },

    stack_alloc:function (nb)
    {
        var code = [];

        for (var i=0; i<nb; i++)
            code.push(_op("push", _$(_UNDEFINED)));

        return code;
    },
    
    nop:function (nb)
    {
        switch(nb)
        {
            case 1: return [0x90];
            case 2: return [0x66, 0x90];
            case 3: return [0x0f, 0x1f, 0x00];
            case 4: return [0x0f, 0x1f, 0x40, 0x00];
            case 5: return [0x0f, 0x1f, 0x44, 0x00, 0x00];
            case 6: return [0x66, 0x0f, 0x1f, 0x44, 0x00, 0x00];
            case 7: return [0x0f, 0x1f, 0x80, 0x00, 0x00, 0x00, 0x00];
            case 8: return [0x0f, 0x1f, 0x84, 0x00, 0x00, 0x00, 0x00, 0x00];
            case 9: return [0x66, 0x0f, 0x1f, 0x84, 0x00, 0x00, 0x00, 0x00, 0x00];
        }
    },

    nop_cste:function (nb)
    {
        assert(nb <= 5);

        var nop = this.nop(nb);
        var n = nop[0];

        for (var i = nop.length - 1; i >= 0; --i)
        {
            n = n << 8;
            n += nop[i];
        }

        return n;
    },

    push_block:function (isSwitch)
    {
        if (isSwitch === undefined)
        {
            isSwitch = false;
        }

        this.previous_blocks.push(this.block);
        this.block = {"continue":(isSwitch ? this.block["continue"] : _label()), 
                      "break":_label(), 
                      "try_lvl":this.try_lvl, 
                      "stack_location_nb":this.stack_location_nb,
                      "bias":this.bias};
    },

    pop_block:function ()
    {
        this.block = this.previous_blocks.pop();
    },

    cont_lbl:function ()
    {
        return this.block["continue"];
    },

    break_lbl:function ()
    {
        return this.block["break"];
    },

    enter_global_scope:function (scope)
    {
        this.previous_scopes.push(this.scope);
        this.scope = scope;
        this.previous_biases.push(this.bias);
        this.bias  = 0;
        this.previous_try_lvls.push(this.try_lvl);
        this.try_lvl = 0;

        var stack_offsets = {};
        var stack_location_nb = 0;

        this.previous_offsets.push(this.stack_offsets);
        this.stack_offsets   = stack_offsets;
        this.previous_stack_location_nb.push(this.stack_location_nb);
        this.stack_location_nb = stack_location_nb;
        this.previous_deferred.push(this.deferred);
        this.deferred = [];
    },

    leave_global_scope:function ()
    {
        this.scope = this.previous_scopes.pop();
        this.bias = this.previous_biases.pop();
        this.stack_location_nb = this.previous_stack_location_nb.pop();
        this.stack_offsets   = this.previous_offsets.pop();
        this.try_lvl = this.previous_try_lvls.pop();
        this.deferred = this.previous_deferred.pop();
    },

    enter_function_scope:function (scope, args)
    {
        this.previous_scopes.push(this.scope);
        this.scope = scope;
        this.previous_biases.push(this.bias);
        this.bias  = 0;
        this.previous_try_lvls.push(this.try_lvl);
        this.try_lvl = 0;
        this.previous_arg_nb.push(this.arg_nb);
        this.arg_nb = args.length;
        this.previous_deferred.push(this.deferred);
        this.deferred = [];

        var stack_offsets = {};
        var stack_location_nb = 0;

        // Arguments offsets
        for (var i = 0; i < args.length; ++i)
        {
           stack_offsets[args[i]] = (i+photon.protocol.base_arg_nb+2)*this.sizeof_ref;
        }

        var offset = -this.sizeof_ref;
        for (var id in scope.declared)
        {
            // Skip arguments
            if (scope.declared[id].isParam === true) continue;

            stack_offsets[id] = offset;
            offset -= this.sizeof_ref;
            stack_location_nb++;
        }

        this.previous_offsets.push(this.stack_offsets);
        this.stack_offsets   = stack_offsets;
        this.previous_stack_location_nb.push(this.stack_location_nb);
        this.stack_location_nb = stack_location_nb;
    },

    leave_function_scope:function ()
    {
        this.scope = this.previous_scopes.pop();
        this.bias = this.previous_biases.pop();
        this.stack_location_nb = this.previous_stack_location_nb.pop();
        this.stack_offsets   = this.previous_offsets.pop();
        this.try_lvl = this.previous_try_lvls.pop();
        this.arg_nb = this.previous_arg_nb.pop();
        this.deferred = this.previous_deferred.pop();
    },

    enter_try_block:function ()
    {
        this.stack_location_nb += 2;
        this.previous_biases.push(this.bias);
        this.bias = this.stack_location_nb * this.sizeof_ref;
        this.try_lvl++;
    },

    leave_try_block:function ()
    {
        this.bias = this.previous_biases.pop();
        this.stack_location_nb -= 2;
        this.try_lvl--;
    },

    enter_catch_scope:function (scope)
    {
        this.previous_offsets.push(this.stack_offsets);
        var stack_offsets = Object.create(this.stack_offsets);

        for (var id in scope.declared)
        {
            stack_offsets[id] = (++this.stack_location_nb) * -this.sizeof_ref;
        }
        this.stack_offsets = stack_offsets;

        this.previous_scopes.push(this.scope);
        this.scope = scope;
    },

    leave_catch_scope:function ()
    {
        this.scope   = this.previous_scopes.pop();
        this.stack_offsets = this.previous_offsets.pop();
        this.stack_location_nb--;
    },

    current_scope:function ()
    {
        return this.scope;
    },

    lookup:function (id)
    {
        return this.current_scope().lookup(id);
    },

    stack_offset:function (id)
    {
        var offset = this.stack_offsets[id] + this.bias;
        return offset;
    },

    this_stack_offset:function ()
    {
        return this.this_offset + this.bias;
    },

    clos_stack_offset:function ()
    {
        return this.clos_offset + this.bias;
    },

    arg_nb_stack_offset:function ()
    {
        return this.arg_nb_offset + this.bias;
    },

    new_ref_ctxt:function ()
    {
        this.previous_refs.push(this.refs);
        this.refs = [];
    },

    pop_ref_ctxt:function ()
    {
        this.refs = this.previous_refs.pop();
    },

    ref_ctxt:function ()
    {
        return this.refs;
    },

    new_function_object:function (code, ref_labels, cell_nb, print)
    {
        if (cell_nb === undefined)
        {
            cell_nb = 0;
        }

        //print("Code AST");
        //print(code.toString());
        code = flatten(code);
        //print("Flattened Code AST");
        //print(clean(code).toString());
        var codeBlock = _asm(code).codeBlock;

        codeBlock.align(this.sizeof_ref);
        codeBlock.genListing("// Filling bytes for alignment");
        //print("assemble");
        codeBlock.assemble();
        //print(codeBlock.code.toString());
        //print("listing");

        if (print !== undefined)
        {
            print(codeBlock.listingString());
        }


        ref_labels.sort(function (a, b)
        {
            return b.getPos() - a.getPos();
        });

        // Add positions of refs as tagged integers
        ref_labels.forEach(function (l)
        {
            codeBlock.gen32(_ref(l.offset_type !== "negated" ? l.getPos() : -l.getPos()));
        });

        // Add the number of refs as a tagged integer
        codeBlock.gen32(_ref(ref_labels.length));

        code = clean(codeBlock.code);
        var length = code.length;

        var f = photon.send(photon["function"], "__new__", length, cell_nb);
        photon.send(f, "__intern__", code);

        return f;
    },

    new_js_function_object:function (name, args, body)
    {
        var code = [
            this.gen_prologue(this.stack_location_nb, args.length),
            body,
            _op("mov", _$(_UNDEFINED), _EAX),
            this.gen_epilogue(args.length)
        ];
        var f = this.new_function_object(code, this.ref_ctxt(), 0, (name === "foobar") ? print : undefined);
        photon.send(f, "__set__", "length", args.length);
        
        // Remember globally defined functions for direct access
        if (name !== undefined && this.previous_scopes.length === 2)
        { 
            this.functions[name] = f;
        }
        
        return f;
    },

    gen_closure:function (f, scope, offsets)
    {
        var cell_nb = 0;

        for (id in scope.captured())
        {
            cell_nb++;
        }
        
        var label  = _label();
        ref_labels = [label];
            
        var c = this.new_function_object([
            _op("mov", _$(addr_to_num(f.__addr_bytes__()), label), _EAX),
            _op("jmp", _EAX)
        ], ref_labels, cell_nb);
        photon.send(c, "__set__", "length", photon.send(f, "__get__", "length"));

        return _op("mov", this.gen_mref(c), _EAX); 
    },

    gen_prologue:function (local_n, arg_n)
    {
        var a = new (x86.Assembler)(x86.target.x86);
       
        if (arg_n > 0)
        {
            var FAST = _label("FAST_ENTRY");

            // Check arg number
            a.
            push(_EBP).
            cmp(_$(arg_n), _mem(8, _ESP), 32).
            jge(FAST).
            mov(this.gen_mref(photon.variadic_enter), _EAX).
            push(_$(arg_n)).
            call(_EAX);
            a.codeBlock.extend(this.magic_cookie());
            a.
            add(_$(4), _ESP).
            // Fast entry point
            label(FAST).
            mov(_ESP, _EBP);
        }
        else
        {
            // Setup stack frame 
            a.
            enter(_$(0),_$(0)); // not really faster but easier to read
            //push(_EBP).
            //mov(_ESP, _EBP);
        }

        // Reserve space for locals
        for (var i=0; i<local_n; i++)
            a.push(_$(_UNDEFINED));

        return a.codeBlock.code;
    },

    gen_epilogue:function (arg_n)
    {
        var a = new (x86.Assembler)(x86.target.x86);

        for (var i = 0; i < this.try_lvl; ++i)
        {
            a.mov(_mem(0, _EBP), _EBP);
        }

        if (arg_n > 0)
        {
            var SLOW = _label("SLOW");
            a.
            cmp(_$(arg_n), _mem(8, _EBP), 32).
            jl(SLOW).
            leave(). // not really faster but easier to read
            //mov(_EBP, _ESP).   
            //pop(_EBP).
            ret().
            label(SLOW).
            mov(_$(arg_n), _EDX).
            mov(this.gen_mref(photon.variadic_exit), _ECX).
            jmp(_ECX);
        }
        else
        {
            a.
            leave(). // not really faster but easier to read
            //mov(_EBP, _ESP).   
            //pop(_EBP).
            ret();
        }

        this.deferred_insert(a);

        return a.codeBlock.code;
    },

    gen_type_check:function (n, name, nb, end)
    {
        if (n === undefined)
        {
            n = 2;
        }

        if (name === undefined)
        {
            name = "";
        }

        var a = new (x86.Assembler)(x86.target.x86);
        var FAST = _label("FAST");

        a.
        genListing("TYPE TEST:").
        mov(_EAX, _ECX).
        and(_$(1), _ECX);

        if (n === 2)
        {
            a.
            and(_mem(0, _ESP), _ECX);
        }

        a.
        jne(FAST);

        if (photon.handlers[name] !== undefined)
        {
            a.
            pop(_ECX).
            codeBlock.extend(this.gen_call(
                nb, 
                _op("mov", this.gen_mref(photon.handlers[name]), _EAX),
                [[], _op("mov", _ECX, _EAX)]));
            a.
            jmp(end);
        } else
        {
            a.codeBlock.extend(this.gen_throw(this.gen_symbol("Fixnum test failed for '" + name + "', no handler defined")));
        }

        a.
        label(FAST);

        return a.codeBlock.code;
    },

    gen_ovf_check:function (op)
    {
        var a = new (x86.Assembler)(x86.target.x86);
        var NO_OVF = _label("NO_OVF");

        a.
        jno(NO_OVF);

        a.codeBlock.extend(this.gen_throw(this.gen_symbol(op + " overflow")));

        a.
        label(NO_OVF);

        return a.codeBlock.code;
    },

    gen_binop:function (f)
    {
        var a = new (x86.Assembler)(x86.target.x86);
        f.call(this, a);
        return a.codeBlock.code;
    },

    gen_arith_cste:function (nb, op, cste)
    {
        var a = new (x86.Assembler)(x86.target.x86);
        var END       = _label("END");
        var OVF       = _label("OVF");
        var TYPE_FAIL = _label("TYPE_FAIL");

        if (op === "+")
        {
            var handler = photon.handlers.add;
        } else if (op === "-")
        {
            var handler = photon.handlers.sub;
        }

        a.
        mov(_EAX, _ECX).
        and(_$(1), _ECX).
        je(TYPE_FAIL);

        if (op === "+")
        {
            a.add(_$(_ref(cste) - 1), _EAX);
        } else if (op === "-")
        {
            a.sub(_$(_ref(cste) - 1), _EAX);
        }

        a.
        jo(OVF).
        label(END);

        var a2 = new (x86.Assembler)(x86.target.x86);

        a2.
        label(TYPE_FAIL).
        mov(_EAX, _ECX);

        if (handler !== undefined)
        {
            a2.codeBlock.extend(this.gen_call(
                nb, 
                _op("mov", this.gen_mref(photon.handlers.add), _EAX),
                [_op("mov", _$(_ref(cste)), _EAX), _op("mov", _ECX, _EAX)]));
        }

        a2.
        jmp(END).
        label(OVF);

        a2.codeBlock.extend(this.gen_throw(this.gen_symbol("Cste arithmetic overflow")));

        a2.
        jmp(END);

        this.defer(a2.codeBlock.code);

        return a.codeBlock.code;
    },

    gen_add:function (nb)
    {
        var a = new (x86.Assembler)(x86.target.x86);
        var END       = _label("END");
        var OVF       = _label("OVF");
        var TYPE_FAIL = _label("TYPE_FAIL");
    
        a.
        mov(_EAX, _ECX).
        and(_mem(0, _ESP), _ECX).
        and(_$(1), _ECX).
        pop(_ECX).
        je(TYPE_FAIL).
        dec(_EAX).
        add(_ECX, _EAX).
        jo(OVF).
        label(END);

        var a2 = new (x86.Assembler)(x86.target.x86);

        a2.
        label(TYPE_FAIL);

        a2.codeBlock.extend(this.gen_call(
            nb, 
            _op("mov", this.gen_mref(photon.handlers.add), _EAX),
            [[], _op("mov", _ECX, _EAX)]));

        a2.
        jmp(END).
        label(OVF);

        a2.codeBlock.extend(this.gen_throw(this.gen_symbol("Addition overflow")));

        a2.
        jmp(END);

        this.defer(a2.codeBlock.code);

        return a.codeBlock.code;
    },

    gen_if_binop_cmp_cste:function (op, cste, true_branch, else_branch)
    {
        var a = new (x86.Assembler)(x86.target.x86);
        var FALSE     = _label("FALSE");
        var END       = _label("END");

        if (typeof cste === "number")
        {
            var imm = _ref(cste);
        } else if (cste === true)
        {
            var imm = _TRUE;
        } else if (cste === false)
        {
            var imm = _FALSE;
        } else if (cste === null)
        {
            var imm = _NIL
        } else if (cste === undefined)
        {
            var imm = _UNDEFINED;
        } else
        {
            error("Invalid cste");
        }

        if (op === "===")
        {
            var op = "jne";
        } else if (op === "!==")
        {
            var op = "je";
        } else 
        {
            error("Invalid op value");
        }
    
        a.
        cmp(_$(imm), _EAX)
        [op](FALSE);

        a.codeBlock.extend(true_branch);

        a.
        jmp(END).
        label(FALSE);

        a.codeBlock.extend(else_branch);

        a.label(END);
        return a.codeBlock.code;
    },

    gen_if_binop_rel_nb:function (op, cste, true_branch, else_branch)
    {
        var a = new (x86.Assembler)(x86.target.x86);
        var FALSE     = _label("FALSE");
        var END       = _label("END");
        var TYPE_FAIL = _label("TYPE_FAIL");

        var imm = _ref(cste);

        if (op === "<")
        {
            var op = "jge";
        } else if (op === "<=")
        {
            var op = "jg";
        } else if (op === ">")
        {
            var op = "jle";
        } else if (op === ">=")
        {
            var op = "jl";
        } else 
        {
            error("Invalid op value");
        }
    
        a.
        mov(_EAX, _ECX).
        and(_$(1), _ECX).
        je(TYPE_FAIL).
        cmp(_$(imm), _EAX)
        [op](FALSE);

        a.codeBlock.extend(true_branch);

        a.
        jmp(END).
        label(FALSE);

        a.codeBlock.extend(else_branch);

        a.label(END);

        var a2 = new (x86.Assembler)(x86.target.x86);

        a2.
        label(TYPE_FAIL);

        a2.codeBlock.extend(this.gen_throw(this.gen_symbol("Invalid operand type for if_binop_rel_nb")));


        this.defer(a2.codeBlock.code);

        return a.codeBlock.code;
    },


    gen_arith:function (op, commut)
    {
        function f(a)
        {
            a.
            mov(_EAX, _ECX);

            if (commut === true)
            {
                a[op](_mem(0, _ESP), _ECX);
            } else
            {
                a.
                xchg(_mem(0, _ESP), _ECX)
                [op](_mem(0, _ESP), _ECX);
            }

            var NO_OVF = _label("NO_OVF");

            a.
            jno(NO_OVF);

            a.codeBlock.extend(this.gen_throw(this.gen_symbol("'" + op + "' arithmetic overflow")));

            a.
            label(NO_OVF).
            mov(_ECX, _EAX);

        }


        return this.gen_binop(f);
    },

    gen_arith_div:function (isMod)
    {
        var code = 
        [
            _op("mov", _EAX, _ECX),
            _op("dec", _ECX),
            _op("mov", _mem(0, _ESP), _EAX),
            _op("dec", _EAX),
            _op("cdq"),
            _op("idiv", _ECX),
            this.gen_ovf_check(isMod ? "mod" : "div")
        ];

        if (isMod)
        {
            code.push(_op("mov", _EDX, _EAX));
        } else
        {
            code.push(_op("sal", _$(1), _EAX));
        }

        code.push(_op("inc", _EAX));

        return code;
    },

    gen_arith_mul:function ()
    {
        return [
            _op("mov", _EAX, _ECX), 
            _op("sar", _$(1), _EAX), 
            _op("mov", _mem(0, _ESP), _ECX),
            _op("dec", _ECX), 
            _op("imul", _ECX), 
            this.gen_ovf_check("mul"),
            _op("inc", _EAX)
        ];
    },

    gen_rel:function (op)
    {
        function f(a)
        {
            a.
            cmp(_EAX, _mem(0, _ESP)).
            mov(_$(_FALSE), _EAX).
            mov(_$(_TRUE), _ECX)
            [op](_ECX, _EAX);
        }

        return this.gen_binop(f);
    },

    gen_logic:function (op)
    {
        function f(a)
        {
            a
            [op](_mem(0, _ESP), _EAX).
            cmp(_$(_TRUE), _EAX).
            mov(_$(_FALSE), _ECX).
            cmovnz(_ECX, _EAX);
        }

        return this.gen_binop(f);
    },

    gen_shiftop:function (op)
    {
        function f(a)
        {
            a.
            mov(_EAX, _ECX).
            sar(_$(1), _ECX).
            mov(_mem(0, _ESP), _EAX).
            sar(_$(1), _EAX)
            [op](_reg.cl, _EAX).
            sal(_$(1), _EAX).
            inc(_EAX);
        }

        return this.gen_binop(f);
    },

    gen_bitwise:function (op)
    {
        function f(a)
        {
            a.
            mov(_EAX, _ECX).
            sar(_$(1), _ECX).
            mov(_mem(0, _ESP), _EAX).
            sar(_$(1), _EAX)
            [op](_ECX, _EAX).
            sal(_$(1), _EAX).
            inc(_EAX);
        }

        return this.gen_binop(f);
    },

    gen_mref:function (m)
    {
        var label = _label();
        this.ref_ctxt().push(label);

        assert(m === null || ((typeof m) === "object" && m.__addr__ !== undefined), "Invalid reference");

        if (m === null)
            return _$(0, label);

        if (typeof m.__addr_bytes__ !== "function")
        {
            var bytes = mirror_addr_bytes.call(m);
        } else
        {
            var bytes = m.__addr_bytes__();
        }
        return _$(addr_to_num(bytes), label);
    },

    gen_arg:function (a)
    {
        return _op("mov", a, _EAX);
    },

    gen_symbol:function (s)
    {
        if (typeof s !== "string")
        {
            throw error("Invalid string value '" + s + "'", {compiler:this.compiler});
        }
        return _op("mov", this.gen_mref(photon.send(photon.symbol, "__intern__", s)), _EAX);
    },

    gen_send:function (nb, rcv, msg, args, bind_helper)
    {
        if (bind_helper === undefined)
        {
            bind_helper = photon.bind;
        }

        var loc = -(this.stack_location_nb + nb) * this.sizeof_ref + this.bias;
        var that = this;

        var msg_expr = this.gen_symbol(msg);

        return [
            this.stack_alloc(nb),
            rcv,
            _op("mov", _EAX, _mem(loc + this.sizeof_ref, _EBP), 32),
            args.map(function (a, i) 
            { 
                var offset = loc + (i + 3) * that.sizeof_ref;
                return [a, _op("mov", _EAX, _mem(offset, _EBP))]; 
            }),
            _op("mov", _$(args.length), _mem(loc, _EBP), 32),

            // Bind
            msg_expr,
            _op("push", _EAX),
            _op("push", _$(0)), // NULL CLOSURE
            _op("push", _$(0)), // NULL RECEIVER
            _op("push", _$(4)),  // Arg number
            _op("mov", this.gen_mref(bind_helper), _EAX),
            _op("call", _EAX),
            this.magic_cookie(),
            _op("add", _$(16), _ESP),
            _op("mov", _EAX, _mem(loc + 2 * this.sizeof_ref, _EBP)), // SET CLOSURE
            _op("call", _EAX),
            this.magic_cookie(),
            _op("add", _$(nb*this.sizeof_ref), _ESP)
        ];
    },

    gen_call:function (nb, fn, args)
    {
        var loc = -(this.stack_location_nb + nb) * this.sizeof_ref + this.bias;
        var that = this;

        return [
            this.stack_alloc(nb),
            args.map(function (a, i) 
            { 
                return [a, _op("mov", _EAX, _mem(loc + (i + 3) * that.sizeof_ref, _EBP))]; 
            }),
            _op("mov", _$(args.length), _mem(loc, _EBP), 32),
            _op("mov", this.gen_mref(photon.global), _mem(loc + this.sizeof_ref, _EBP), 32),
            fn, 
            _op("mov", _EAX, _mem(loc + 2 * this.sizeof_ref, _EBP)), 
            _op("call", _EAX), 
            this.magic_cookie(),
            _op("add", _$(nb*this.sizeof_ref), _ESP)
        ];
    },

    gen_get_local:function (id)
    {
        return _op("mov", _mem(this.stack_offset(id), _EBP), _EAX); 
    },

    gen_set_local:function (id, val)
    {
        return [val, _op("mov", _EAX, _mem(this.stack_offset(id), _EBP))];
    },

    gen_try_catch:function (t, c, catch_scope)
    {
        var TRY = _label("TRY");
        var END = _label("END");    

        return [
            _op("call", TRY),
            this.magic_cookie(),

            // CATCH
            this.nop(this.sizeof_ref),
            _op("push", _EAX),
            c,
            _op("pop", _EAX),
            _op("jmp", END),

            // TRY
            TRY,
            _op("push", _EBP),
            _op("mov", _ESP, _EBP),
            t,
            _op("mov", _EBP, _ESP),
            _op("pop", _EBP),
            _op("add", _$(this.sizeof_ref), _ESP),

            END
        ];
    },

    gen_throw:function (e)
    {
        var LOOP = _label();
        var END  = _label();
        var CONT = _label();

        return [
            e,
            _op("push", _EAX),      // Save exception object
            _op("mov", _EBP, _ECX), // Start searching for handler
            LOOP,
            _op("mov", _mem(4, _ECX), _EAX), // Retrieve return address pointer
            _op("cmp", _$(0xd181), _mem(0, _EAX), 16), // Check if it is a Photon frame
            _op("jne", CONT),                // No! keep going
            _op("cmp", _$(this.nop_cste(4)), _mem(6, _EAX), 32), // Check if it is a handler
            _op("je", END),                  // Yes! jump to handler
            CONT,
            _op("mov", _mem(0, _ECX), _ECX), // No, check next stack frame
            _op("jmp", LOOP),
            END,
            _op("pop", _EAX),       // Restore exception object
            _op("mov", _ECX, _ESP), // Restore stack pointer
            _op("pop", _EBP),       // Restore stack frame
            _op("ret")              // Jump to handler
        ];
    },

    gen_get_this:function ()
    {
        return _op("mov", _mem(this.this_stack_offset(), _EBP), _EAX);
    },

    gen_get_clos:function ()
    {
        return _op("mov", _mem(this.clos_stack_offset(), _EBP), _EAX);
    },

    gen_pop_try_frames:function ()
    {
        var code = [];
        if (this.try_lvl > this.block["try_lvl"])
        {
            print("try_lvl > this.block.try_lvl");
            for (var i = this.block["try_lvl"] + 1; i < this.try_lvl; ++i)
            {
                code.push(_op("mov", _mem(0, _EBP), _EBP));    
            }

            code.push([_op("mov", _EBP, _ESP), 
                       _op("pop", _EBP),
                       _op("add", _$(this.sizeof_ref), _ESP)]);
        }
        return code;
    },

    gen_break:function ()
    {
        var bias         = this.bias - this.block.bias;
        var stack_offset = (this.stack_location_nb - 
                            this.block.stack_location_nb) * this.sizeof_ref;
        return [
            _op("add", _$(bias), _EBP), 
            _op("add", _$(stack_offset), _ESP), 
            _op("jmp", this.break_lbl())
        ];
    },
    
    gen_continue:function ()
    {
        var bias         = this.bias - this.block.bias;
        var stack_offset = (this.stack_location_nb - 
                            this.block.stack_location_nb) * this.sizeof_ref;
        return [
            _op("add", _$(bias), _EBP), 
            _op("add", _$(stack_offset), _ESP), 
            _op("jmp", this.cont_lbl())
        ];
    },

    enter_let_init:function (scope)
    {
        var stack_offsets = Object.create(this.stack_offsets);

        for (var id in scope.declared)
        {
            stack_offsets[id] = (++this.stack_location_nb) * -this.sizeof_ref;
        }

        return stack_offsets;
    },

    enter_let_scope:function (scope, os)
    {
        this.previous_offsets.push(this.stack_offsets);
        this.stack_offsets = os;
        this.previous_scopes.push(this.scope);
        this.scope = scope;
    },

    leave_let_scope:function ()
    {
        var i = 0;
        for (var id in this.scope.declared)
        {
            ++i;
        }

        this.stack_location_nb -= i;
        this.scope   = this.previous_scopes.pop();
        this.stack_offsets = this.previous_offsets.pop();

        return i;
    },

    gen_let_binding:function (os, name, val)
    {
        return [val, _op("mov", _EAX, _mem(os[name]+this.bias, _EBP))];
    },

    gen_let:function (nb, es, body)
    {
        return [
            this.stack_alloc(nb),
            es,
            body,
            _op("add", _$(nb*this.sizeof_ref), _ESP)
        ];
    },
    gen_ccall:function (nb, fn, args)
    {
        var loc = -(this.stack_location_nb + nb) * this.sizeof_ref + this.bias;
        var that = this;
        return [this.stack_alloc(nb),
                args.map(function (a, i) 
                { 
                    return [a, _op("mov", _EAX, _mem(loc + i * that.sizeof_ref, _EBP))]; 
                }),
                fn, _op("call", _EAX), 
                this.magic_cookie(),
                _op("add", _$(nb*this.sizeof_ref), _ESP)];
    },

    gen_get_arguments:function (i)
    {
        return [i, _op("sar", _$(1), _EAX), _op("mov", _mem(5*this.sizeof_ref + this.bias, _EBP, _EAX, this.sizeof_ref), _EAX)];
    },

    gen_set_arguments:function (i, v)
    {
        return [i, _op("push", _EAX), v, _op("pop", _ECX), _op("sar", _$(1), _ECX), _op("mov", _EAX, _mem(5*this.sizeof_ref + this.bias, _EBP, _ECX, this.sizeof_ref))];
    },

    gen_get_arguments_length:function ()
    {
        return [_op("mov", _mem(this.arg_nb_stack_offset(), _EBP), _EAX), _op("sal", _$(1), _EAX), _op("inc", _EAX)];
    },

    gen_set_arguments_length:function (v)
    {
        return [v, _op("sar", _$(1), _EAX), _op("mov", _EAX, _mem(this.arg_nb_stack_offset(), _EBP))];
    },
    gen_set_this:function (v)
    {
        return [v, _op("mov", _EAX, _mem(this.this_stack_offset(), _EBP))];
    },
    gen_set_closure:function (v)
    {
        return [v, _op("mov", _EAX, _mem(this.clos_stack_offset(), _EBP))];
    }
};
