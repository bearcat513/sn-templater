(function execute(inputs, outputs) {
    var templater = new x_1040823_template.Templater();
    var deck = inputs.template ? templater.deck(String(inputs.template)) : templater.deck();
    if (inputs.title) deck.title(String(inputs.title));
    if (inputs.template && inputs.query) deck.records(String(inputs.query));
    if (inputs.template && inputs.limit) deck.limit(Number(inputs.limit));
    deck.save(String(inputs.name || inputs.title || 'Presentation'));
    outputs.presentation = deck.sysId();
    outputs.present_url = deck.presentUrl({ absolute: true });
    outputs.build_url = deck.buildUrl({ absolute: true });
})(inputs, outputs);
