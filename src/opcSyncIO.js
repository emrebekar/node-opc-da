//@ts-check
/*
  Copyright: (c) 2019, Guilherme Francescon Cittolin <gfcittolin@gmail.com>
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

const constants = require('./constants.js');
const filetime = require('./filetime');

const { CallBuilder, ComArray, ComValue, Flags, Pointer, Struct, Variant, Types } = require('dcom');

/**
 * Represents an OPC Sync IO Object
 */
class OPCSyncIO {

  constructor() {
    this._comObj = null;
  }

  /**
   *
   * @param {*} unknown
   * @returns {Promise<?>}
   */
  async init(unknown) {
    if (this._comObj) throw new Error("Already initialized");

    this._comObj = await unknown.queryInterface(constants.iid.IOPCSyncIO_IID);

    this._comObj.on('disconnected', function(){
      console.log("CONNECTION LOST");
  });
  }

  async end() {
    if (!this._comObj) return;

    let obj = this._comObj;
    this._comObj = null;
    await obj.release();
  }

  /**
   * 
   * @param {number} source 
   * @param {number[]} handles an array of server handles
   * @returns {Promise<object[]>}
   * @opNum 0
   */
  async read(source, handles) {
    if (!this._comObj) throw new Error("Not initialized");

    if (!(handles.length > 0)) return [];

    // TODO maybe we can have a single static instance of this,
    // without the need to instantiate one every call. To be tested
    let itemStateStruct = new Struct();
    itemStateStruct.addMember(new ComValue(null, Types.INTEGER));
    itemStateStruct.addMember(new ComValue(filetime.getStruct(), Types.STRUCT));
    itemStateStruct.addMember(new ComValue(null, Types.SHORT));
    itemStateStruct.addMember(new ComValue(null, Types.SHORT));
    itemStateStruct.addMember(new ComValue(null, Types.VARIANT));

    let callObject = new CallBuilder(true);
    callObject.setOpnum(0);

    callObject.addInParamAsShort(source, Flags.FLAG_NULL);
    callObject.addInParamAsInt(handles.length, Flags.FLAG_NULL);

    let temporaryHandles = new Array();
    for (let i = 0; i < handles.length; i++)
      temporaryHandles.push(new ComValue(handles[i], Types.INTEGER));
    callObject.addInParamAsArray(new ComArray(new ComValue(temporaryHandles, Types.INTEGER), true), Flags.FLAG_NULL);

    let resStructArray = new ComArray(new ComValue(itemStateStruct, Types.STRUCT), null, 1, true)
    let errCodesArray = new ComArray(new ComValue(null, Types.INTEGER), null, 1, true)
    callObject.addOutParamAsObject(new ComValue(new Pointer(new ComValue(resStructArray, Types.COMARRAY)), Types.POINTER), Flags.FLAG_NULL);
    callObject.addOutParamAsObject(new ComValue(new Pointer(new ComValue(errCodesArray, Types.COMARRAY)), Types.POINTER), Flags.FLAG_NULL);

    let resultObj = await this._comObj.call(callObject);

    let hresult = resultObj.hresult;
    let result = resultObj.getResults();
    if (hresult != 0) {
        if (result.lenght == 0)
            throw new Error(String(hresult));
        else 
            console.log(new Error(String(hresult)));
    }

    let results = result[0].getValue().getReferent().getArrayInstance();
    let errorCodes = result[1].getValue().getReferent().getArrayInstance();

    let res = [];
    for (let i = 0; i < handles.length; i++) {
      let resObj = {
        errorCode: errorCodes[i].getValue(),
        clientHandle: results[i].getValue().getMember(0).getValue(),
        timestamp: filetime.fromStruct(results[i].getValue().getMember(1).getValue()).getDate(),
        quality: results[i].getValue().getMember(2).getValue(),
        reserved: results[i].getValue().getMember(3).getValue(),
        value: (!results[i].getValue().getMember(4).getValue().member.getValue().referent.isArray) ? 
          results[i].getValue().getMember(4).getValue().member.getValue().referent.obj.getValue() :
          results[i].getValue().getMember(4).getValue().member.getValue().referent.getArray(0).memberArray,      
      };
      res.push(resObj);
    }

    return res;
  }

  /**
   * 
   * @param {object[]} writes 
   * @param {number} writes[].handle
   * @param {number} writes[].type
   * @param {*} writes[].value
   * @returns {Promise<number[]>} error codes
   * @opNum 1
   */
  async write(writes) {
    if (!this._comObj) throw new Error("Not initialized");

    if (!(writes.length > 0)) return [];

    let callObject = new CallBuilder(true);
    callObject.setOpnum(0);

    let handles = [];
    let values = [];
    for (const write of writes) {
      let valVariant = new Variant(new ComValue(write.value, write.type), true);
      if(Array.isArray(write.value) && write.type == Types.BOOLEAN) {
        valVariant.setFlag(Flags.FLAG_REPRESENTATION_VARIANT_BOOL);
      }
      handles.push(write.handle);
      values.push(valVariant);
    }

    callObject.addInParamAsInt(writes.length, Flags.FLAG_NULL);
    callObject.addInParamAsArray(new ComArray(new ComValue(handles, Types.INTEGER), true), Flags.FLAG_NULL);
    callObject.addInParamAsArray(new ComArray(new ComValue(values, Types.VARIANT), true), Flags.FLAG_NULL);
    let errCodesArray = new ComArray(new ComValue(null, Types.INTEGER), null, 1, true)
    callObject.addOutParamAsObject(new ComValue(new Pointer(new ComValue(errCodesArray, Types.COMARRAY)), Types.POINTER), Flags.FLAG_NULL);

    let resultObj = await this._comObj.call(callObject);

    let hresult = resultObj.hresult;
    let result = resultObj.getResults();
    if (hresult != 0) {
        if (result.lenght == 0)
            throw new Error(String(hresult));
        else 
            console.log(new Error(String(hresult)));
    }

    return result[0].getReferent().getArrayInstance();
  }

}

module.exports = OPCSyncIO;