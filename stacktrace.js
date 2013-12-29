// Domain Public by Eric Wendelin http://eriwen.com/ (2008)
//                  Luke Smith http://lucassmith.name/ (2008)
//                  Loic Dachary <loic@dachary.org> (2008)
//                  Johan Euphrosine <proppy@aminche.com> (2008)
//                  Oyvind Sean Kinsey http://kinsey.no/blog (2010)
//                  Victor Homyakov <victor-homyakov@users.sourceforge.net> (2010)
/*global module, exports, define, ActiveXObject*/
/**
 * Main function giving a function stack trace with a forced or passed in Error
 *
 * @cfg {Error} e The error to create a stacktrace from (optional)
 * @cfg {Boolean} guess If we should try to resolve the names of anonymous functions
 * @return {Array} of Strings with functions, lines, files, and arguments where possible
 */
function printStackTrace(ex) {
    var p = new printStackTrace();
    return p.run(ex);
}

var proto = printStackTrace.prototype;

/**
 * @param {Error} ex The error to create a stacktrace from (optional)
 * @param {String} mode Forced mode (optional, mostly for unit tests)
 */
proto.run: function(ex, mode) {
    ex = ex || this.createException();
    // examine exception properties w/o debugger
    //for (var prop in ex) {alert("Ex['" + prop + "']=" + ex[prop]);}
    mode = mode || this.mode(ex);
    if (mode === 'other') {
        return this.other(arguments.callee);
    } else {
        return this[mode](ex);
    }
};

proto.createException: function() {
    try {
        this.undef();
    } catch (e) {
        return e;
    }
};

/**
 * Mode could differ for different exception, e.g.
 * exceptions in Chrome may or may not have arguments or stack.
 *
 * @return {String} mode of operation for the exception
 */
proto.mode: function(e) {
    if (e['arguments'] && e.stack) {
        return 'chrome';
    } else if (e.stack && e.sourceURL) {
        return 'safari';
    } else if (e.stack && e.number) {
        return 'ie';
    } else if (e.stack && e.fileName) {
        return 'firefox';
    } else if (e.stack && !e.fileName) {
        // Chrome 27 does not have e.arguments as earlier versions,
        // but still does not have e.fileName as Firefox
        return 'chrome';
    }
    return 'other';
};

/**
 * Given a context, function name, and callback function, overwrite it so that it calls
 * printStackTrace() first with a callback and then runs the rest of the body.
 *
 * @param {Object} context of execution (e.g. window)
 * @param {String} functionName to instrument
 * @param {Function} callback function to call with a stack trace on invocation
 */
proto.instrumentFunction: function(context, functionName, callback) {
    context = context || window;
    var original = context[functionName];
    context[functionName] = function instrumented() {
        callback.call(this, printStackTrace().slice(4));
        return context[functionName]._instrumented.apply(this, arguments);
    };
    context[functionName]._instrumented = original;
};

/**
 * Given a context and function name of a function that has been
 * instrumented, revert the function to it's original (non-instrumented)
 * state.
 *
 * @param {Object} context of execution (e.g. window)
 * @param {String} functionName to de-instrument
 */
proto.deinstrumentFunction: function(context, functionName) {
    if (context[functionName].constructor === Function &&
        context[functionName]._instrumented &&
        context[functionName]._instrumented.constructor === Function) {
        context[functionName] = context[functionName]._instrumented;
    }
};

/**
 * Given an Error object, return a formatted Array based on Chrome's stack string.
 *
 * @param e - Error object to inspect
 * @return Array<String> of function calls, files and line numbers
 */
proto.chrome: function(e) {
    return (e.stack + '\n')
        .replace(/^[\s\S]+?\s+at\s+/, ' at ') // remove message
        .replace(/^\s+(at eval )?at\s+/gm, '') // remove 'at' and indentation
        .replace(/^([^\(]+?)([\n$])/gm, '{anonymous}() ($1)$2')
        .replace(/^Object.<anonymous>\s*\(([^\)]+)\)/gm, '{anonymous}() ($1)')
        .replace(/^(.+) \((.+)\)$/gm, '$1@$2')
        .split('\n')
        .slice(0, -1);
};

/**
 * Given an Error object, return a formatted Array based on Safari's stack string.
 *
 * @param e - Error object to inspect
 * @return Array<String> of function calls, files and line numbers
 */
proto.safari: function(e) {
    return e.stack.replace(/\[native code\]\n/m, '')
        .replace(/^(?=\w+Error\:).*$\n/m, '')
        .replace(/^@/gm, '{anonymous}()@')
        .split('\n');
};

/**
 * Given an Error object, return a formatted Array based on IE's stack string.
 *
 * @param e - Error object to inspect
 * @return Array<String> of function calls, files and line numbers
 */
proto.ie: function(e) {
    return e.stack
        .replace(/^\s*at\s+(.*)$/gm, '$1')
        .replace(/^Anonymous function\s+/gm, '{anonymous}() ')
        .replace(/^(.+)\s+\((.+)\)$/gm, '$1@$2')
        .split('\n')
        .slice(1);
};

/**
 * Given an Error object, return a formatted Array based on Firefox's stack string.
 *
 * @param e - Error object to inspect
 * @return Array<String> of function calls, files and line numbers
 */
proto.firefox: function(e) {
    return e.stack.replace(/(?:\n@:0)?\s+$/m, '')
        .replace(/^(?:\((\S*)\))?@/gm, '{anonymous}($1)@')
        .split('\n');
};

// Safari 5-, IE 9-, and others
proto.other: function(curr) {
    var ANON = '{anonymous}', fnRE = /function\s*([\w\-$]+)?\s*\(/i, stack = [], fn, args, maxStackSize = 10;
    while (curr && curr['arguments'] && stack.length < maxStackSize) {
        fn = fnRE.test(curr.toString()) ? RegExp.$1 || ANON : ANON;
        args = Array.prototype.slice.call(curr['arguments'] || []);
        stack[stack.length] = fn + '(' + this.stringifyArguments(args) + ')';
        curr = curr.caller;
    }
    return stack;
};

/**
 * Given arguments array as a String, substituting type names for non-string types.
 *
 * @param {Arguments,Array} args
 * @return {String} stringified arguments
 */
proto.stringifyArguments: function(args) {
    var result = [];
    var slice = Array.prototype.slice;
    for (var i = 0; i < args.length; ++i) {
        var arg = args[i];
        if (arg === undefined) {
            result[i] = 'undefined';
        } else if (arg === null) {
            result[i] = 'null';
        } else if (arg.constructor) {
            if (arg.constructor === Array) {
                if (arg.length < 3) {
                    result[i] = '[' + this.stringifyArguments(arg) + ']';
                } else {
                    result[i] = '[' + this.stringifyArguments(slice.call(arg, 0, 1)) + '...' + this.stringifyArguments(slice.call(arg, -1)) + ']';
                }
            } else if (arg.constructor === Object) {
                result[i] = '#object';
            } else if (arg.constructor === Function) {
                result[i] = '#function';
            } else if (arg.constructor === String) {
                result[i] = '"' + arg + '"';
            } else if (arg.constructor === Number) {
                result[i] = arg;
            }
        }
    }
    return result.join(',');
};

module.exports = printStackTrace;
