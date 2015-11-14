function Base(inputs, outputMap) {
    this.inputs = inputs;
    this.outputMap = outputMap;
    this.data = [];
}

Base.prototype.getData = function() {
    return this.data;
};

Base.prototype.setData = function(data) {
    this.data = data;
    this.dataPointCount = data.length;
};

Base.prototype.getInput = function(key) {
    return this.inputs[key];
};

Base.prototype.getOutputMapping = function(key) {
    return this.outputMap[key];
};

Base.prototype.getOutputMappings = function() {
    return this.outputMap;
};

Base.prototype.getDataSegment = function(length) {
    var data = this.getData();

    // Get only last n data points, where n is either the length provided as input or the
    // length of the array (whichever is smallest so as to not surpass the data array length).
    var dataSegmentLength = Math.min(length, this.dataPointCount);

    return data.slice(this.dataPointCount - dataSegmentLength, this.dataPointCount);
};

Base.prototype.getPrevious = function() {
    var data = this.getData();
    return data[this.dataPointCount - 2];
};

Base.prototype.getLast = function() {
    var data = this.getData();
    return data[this.dataPointCount - 1];
};

Base.prototype.tick = function() {
    throw 'tick() not implemented.';
};

module.exports = Base;