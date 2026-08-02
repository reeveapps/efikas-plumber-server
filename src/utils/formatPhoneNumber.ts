export default function (phoneNumber:string | number | null | undefined){
    if (!phoneNumber){
        return null
    }
    const stringPhoneNo = typeof phoneNumber == "string" ? phoneNumber : phoneNumber.toString();
    return `254${stringPhoneNo.replace(/\D/g, '').slice(-9)}`
}