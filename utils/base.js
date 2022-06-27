exports.getHandle = function (length) {
    let result = ''
    let numbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

    for (let i = 0; i < length; i++) {
        result += numbers[Math.floor(Math.random() * (numbers.length))]
    }

    return result
}