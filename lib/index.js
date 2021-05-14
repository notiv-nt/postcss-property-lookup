import t from 'tcomb';

const plugin = 'postcss-property-lookup';

const LogLevel = t.enums.of(['error', 'warn'], 'LogLevel');
const PluginOptions = t.struct(
  {
    logLevel: LogLevel,
    lookupPattern: t.Re,
    skipUnknown: t.Boolean,
  },
  'PluginOptions',
);

const defaultOptions = {
  logLevel: 'warn',
  lookupPattern: /@\(?([a-z-]+)\)?\b/g,
  skipUnknown: true,
};

export default propertyLookup;
propertyLookup.postcss = true;

function propertyLookup(options) {
  const errorContext = {plugin};
  options = new PluginOptions({...defaultOptions, ...options});

  const log = {
    warn(message, rule, result) {
      rule.warn(result, message);
    },
    error(message, rule) {
      throw rule.error(message, errorContext);
    },
  }[options.logLevel];

  if (!log) {
    throw new Error(`Invalid logLevel: ${options.logLevel}`);
  }

  return {
    postcssPlugin: plugin,
    Root(root, {result}) {
      root.walkRules((rule) => {
        eachDecl(rule, (decl) => {
          if (decl.value.indexOf('@') === -1) {
            return;
          }
          decl.value = decl.value.replace(options.lookupPattern, resolveLookup.bind(this, rule));
        });
      });

      function resolveLookup(rule, orig, prop) {
        const resolvedValue = closest(rule, prop);

        if (!resolvedValue) {
          if (options.skipUnknown) {
            return orig;
          }
          log(`Unable to find property ${orig} in ${rule.selector}`, rule, result);
        }

        return resolvedValue;
      }

      function closest(container, prop) {
        if (!container) {
          return '';
        }
        let resolvedValue;

        eachDecl(container, (decl) => {
          if (decl.prop === prop) {
            resolvedValue = decl.value;
          }
        });

        if (!resolvedValue) {
          return closest(container.parent, prop);
        }

        // Ignore a reference to itself
        // e.g a {color: @color;}
        if (resolvedValue && resolvedValue.replace('@', '') === prop) {
          // Lookup on parent the same property
          return closest(container.parent, prop);
          // return '';
        }

        if (resolvedValue.indexOf('@') === -1) {
          return resolvedValue;
        }

        return resolvedValue.replace(options.lookupPattern, resolveLookup.bind(this, container));
      }
    },
  };
}

function eachDecl(container, callback) {
  container.each((node) => {
    if (node.type === 'decl') {
      callback(node);
    }
    // Recurse through child declarations of a media rule
    if (node.type === 'atrule') {
      eachDecl(node, callback);
    }
  });
}
