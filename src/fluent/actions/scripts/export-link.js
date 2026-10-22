(function execute(inputs, outputs) {
    var templater = new x_1040823_template.Templater();
    var records = inputs.record ? String(inputs.record) : String(inputs.query || '');
    if (!records) throw new Error('Give a record or a query.');
    outputs.url = templater.exportUrl(String(inputs.template), records, { absolute: String(inputs.absolute) === 'true' });
})(inputs, outputs);
