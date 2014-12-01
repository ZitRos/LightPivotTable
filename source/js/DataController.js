/**
 * @param {LightPivotTable} controller
 * @param {function} dataChangeTrigger
 * @constructor
 */
var DataController = function (controller, dataChangeTrigger) {

    if (dataChangeTrigger && typeof dataChangeTrigger !== "function") {
        throw new Error("dataChangeTrigger parameter must be a function");
    }

    this._dataStack = [];

    this.controller = controller;

    this.pushData();
    this.dataChangeTrigger = dataChangeTrigger;

    this.SUMMARY_SHOWN = false;

};

/**
 * Performs check if data is valid.
 *
 * @param {{ dimensions: Object[], dataArray: Array, info: Object }} data
 * @returns boolean
 */
DataController.prototype.isValidData = function (data) {

    return data.dimensions instanceof Array
        && data.dimensions[0] instanceof Array
        && data.dimensions[0].length > 0
        //&& data.dimensions[1].length > 0
        && data.dimensions[0][0].hasOwnProperty("caption")
        //&& data.dimensions[1][0].hasOwnProperty("caption")
        && data.dataArray instanceof Array
        && typeof data["info"] === "object"
        && data["info"]["cubeName"];

};

DataController.prototype.pushData = function () {

    var d;

    this._dataStack.push(d = {
        data: null,
        SORT_STATE: {
            column: null,
            order: -1
        }
    });

    //this.data = d.data;
    this.SORT_STATE = d.SORT_STATE;

};

DataController.prototype.popData = function () {

    if (this._dataStack.length < 2) return;

    var d = this._dataStack[this._dataStack.length - 2];

    this._dataStack.pop();

    //this.data = d.data;
    this.SORT_STATE = d.SORT_STATE;

};

DataController.prototype.getData = function () {

    return this._dataStack[this._dataStack.length - 1].data;

};

DataController.prototype.setData = function (data) {

    if (!this.isValidData(data)) {
        console.error("Invalid data to set.", data);
        return;
    }

    this._dataStack[this._dataStack.length - 1].data = data;
    //this.data = data;
    this.resetRawData();

    this._trigger();
    return data;

};

DataController.prototype.resetRawData = function () {

    var data, summary, y, x;

    if (!(data = this._dataStack[this._dataStack.length - 1].data)) {
        console.error("Unable to create raw data for given data set.");
        return;
    }

    var rd0 = [], rd1 = [], groupNum = 2, rawData = [];

    var transpose = function (a) {
        return Object.keys(a[0]).map(function (c) {
            return a.map(function (r) {
                return r[c];
            });
        });
    };

    var dim0raw = function (a, c, arr) {

        dim1raw(rd0, c, arr);
        rd0 = transpose(rd0);

    };

    var dim1raw = function (a, c, arr) {

        if (!arr) {
            arr = [];
        }

        var cnum;

        for (var i in c) {
            cnum = groupNum;
            if (c[i].children) {
                groupNum++;
                dim1raw(a, c[i].children, arr.concat({
                    group: cnum,
                    source: c[i],
                    isCaption: true,
                    value: c[i].caption || ""
                }));
            } else {
                a.push(arr.concat({
                    group: groupNum,
                    source: c[i],
                    isCaption: true,
                    value: c[i].caption || ""
                }));
                groupNum++;
            }
        }

    };

    if (data.dimensions[0].length) dim0raw(rd0, data.dimensions[0]);
    if (data.dimensions[1].length) dim1raw(rd1, data.dimensions[1]);

    var xw = (rd0[0] || []).length,
        yh = rd1.length || data.info.rowCount || 0,
        xh = rd0.length || data.info.colCount || 0,
        yw = (rd1[0] || []).length;

    // render columns, rows and data
    for (y = 0; y < xh + yh; y++) {
        if (!rawData[y]) rawData[y] = [];
        for (x = 0; x < yw + xw; x++) {
            if (x < yw) {
                if (y < xh) {
                    rawData[y][x] = {
                        group: 1,
                        isCaption: true,
                        value: (data["info"] || {})["cubeName"] || ""
                    };
                } else {
                    rawData[y][x] = rd1[y-xh][x];
                }
            } else {
                if (y < xh) {
                    rawData[y][x] = rd0[y][x-yw];
                } else {
                    rawData[y][x] = {
                        value: data.dataArray[(xw)*(y - xh) + x - yw] || ""
                    };
                }
            }
        }
    }

    data.info.topHeaderRowsNumber = xh;
    data.info.leftHeaderColumnsNumber = yw;
    this.SUMMARY_SHOWN = false;

    if (this.controller.CONFIG["showSummary"] && rawData.length - xh > 1 // xh - see above
        && (rawData[rawData.length - 1][0] || {})["isCaption"]) {
        this.SUMMARY_SHOWN = true;
        rawData.push(summary = []);
        x = rawData.length - 2;
        for (var i in rawData[x]) {
            if (rawData[x][i].isCaption) {
                summary[i] = {
                    group: groupNum,
                    isCaption: true,
                    source: {},
                    value: navigator.language === "ru" ? "Всего" : "Total"
                }
            } else {
                summary[i] = {
                    value: (function countSummaryByColumn(array, iStart, iEnd, column) {
                        var sum = 0;
                        for (var i = iStart; i < iEnd; i++) {
                            if (!isFinite(array[i][column]["value"])) {
                                sum = 0;
                                break;
                            }
                            sum += parseFloat(array[i][column]["value"]) || 0;
                        }
                        return sum || "";
                    })(rawData, xh, rawData.length - 1, i),
                    style: {
                        "font-weight": 900
                    }
                }
            }
        }
        groupNum++;
    }

    data.rawData = data._rawDataOrigin = rawData;

    return data.rawData;

};

/**
 * Trigger the dataChangeTrigger.
 *
 * @private
 */
DataController.prototype._trigger = function () {

    if (this.dataChangeTrigger) this.dataChangeTrigger();

};

/**
 * Sort raw data by column.
 *
 * @param columnIndex
 */
DataController.prototype.sortByColumn = function (columnIndex) {

    var data = this._dataStack[this._dataStack.length - 1].data;

    if (this.SORT_STATE.column !== columnIndex) {
        order = this.SORT_STATE.order = 0;
    }

    var newRawData = data._rawDataOrigin.slice(
            data.info.topHeaderRowsNumber,
            data._rawDataOrigin.length - (this.SUMMARY_SHOWN ? 1 : 0)
        ),
        xIndex = data.info.leftHeaderColumnsNumber + columnIndex,
        order = this.SORT_STATE.order === -1 ? 1 : this.SORT_STATE.order === 1 ? 0 : -1;



    this.SORT_STATE.order = order;
    this.SORT_STATE.column = columnIndex;

    if (order === 0) {
        data.rawData = data._rawDataOrigin;
        this._trigger();
        return;
    }

    order = -order;

    newRawData.sort(function (a, b) {
        if (b[xIndex].value > a[xIndex].value) return order;
        if (b[xIndex].value < a[xIndex].value) return -order;
        return 0;
    });

    data.rawData = data._rawDataOrigin.slice(0, data.info.topHeaderRowsNumber)
        .concat(newRawData)
        .concat(this.SUMMARY_SHOWN ? [data._rawDataOrigin[data._rawDataOrigin.length - 1]] : []);

    console.log(data.rawData);

    this._trigger();

};