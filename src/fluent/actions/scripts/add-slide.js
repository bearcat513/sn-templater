(function execute(inputs, outputs) {
    // The box each layout has for text beside its title.
    var TEXT_SLOT = { title: 'subtitle', titleContent: 'body', section: 'text' };
    var layout = String(inputs.layout || 'titleContent');
    var content = {};
    if (inputs.title && layout !== 'blank') content.title = String(inputs.title);
    if (inputs.text && TEXT_SLOT[layout]) content[TEXT_SLOT[layout]] = String(inputs.text);

    var templater = new x_1040823_template.Templater();
    var deck = templater.openDeck(String(inputs.presentation));
    deck.addSlide(layout, content, inputs.notes ? { notes: String(inputs.notes) } : {});
    deck.save();
    outputs.present_url = deck.presentUrl({ absolute: true });
})(inputs, outputs);
