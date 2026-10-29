// Adapta os caminhos das ferramentas de desenvolvimento ao prefixo usado pelo proxy.
// Next 16.4 usa caminhos absolutos no overlay, fora do prefixo do SageMaker.
module.exports = function prefixDevtools(source) {
  const { prefix } = this.getOptions();
  return prefix
    ? source.replace(/(["'`(])\/__nextjs_/g, (_, opening) => `${opening}${prefix}/__nextjs_`)
    : source;
};
