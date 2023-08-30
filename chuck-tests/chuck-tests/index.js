

const fs = require('fs/promises');
const xmlParser = require('fast-xml-parser');
const {glob} = require('glob');




const {
    // testsPath = "D:/Office/sqx/src/classes/,D:/Office/sqx/extensions/cq-form/force-app/main/default/classes/,D:/Office/sqx/extensions/cq-form/dependent/main/default/classes/", 
    testsPath,
    batchSize=1, 
    testDataPath='test/*.json',
    failing=true} = require('minimist')(process.argv.slice(2));

(async function () {

    const testRuntimeData = await getTestSize(testDataPath);

    const testSizeData = await readFiles(testsPath);

    for(let className in testRuntimeData){
        if(testSizeData.length && !testSizeData[className]){
            delete testRuntimeData[className];
        }
    }

    const finalTestData = {...testSizeData, ...testRuntimeData};

    let tests;

    if(batchSize > 1) {
        let totalTestSize = 0;
        let readyToProcess = [];
    
        for (const className in finalTestData) {
            readyToProcess.push({className: className, size: finalTestData[className]});
            totalTestSize+=finalTestData[className];
        }
    
        const limit = Math.ceil(totalTestSize / batchSize);
        tests = chunks(readyToProcess, limit);
    }else{
        tests = [Object.keys(finalTestData)];
    }

    
    tests.forEach(async function (test, index) {
        const builder = new xmlParser.XMLBuilder({     
            arrayNodeName: "testClassName"
        });
        const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<ApexTestSuite>
    ${builder.build(test)}
</ApexTestSuite>`;
        await fs.mkdir('testSuites', { recursive: true });
        await fs.writeFile('testSuites/testsuite-'+index+'.testSuite-meta.xml', xmlContent);  
    });
})();

async function getTestSize(testPath){
    const files = await glob(testPath);
    const directories = files.toString().split(',');
    let testsBySize = [];
    await Promise.all(directories.map(async (dirname) =>{
        dirname = dirname.trim();
        let testData = await fs.readFile(dirname, 'utf8');
        testData = JSON.parse(testData);
        testData.tests.forEach((test) => {
            if(!failing || test.Outcome === "Fail"){
                testsBySize[test.ApexClass.Name] = testsBySize[test.ApexClass.Name] || 0;
                testsBySize[test.ApexClass.Name] += test.RunTime;
            }
        })
    }));

    // testsBySize = Object.entries(testsBySize)
    // .sort(([,a],[,b]) => a-b)
    // .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});

    // await fs.writeFile('output1.json', JSON.stringify(testsBySize));  
    
    return testsBySize;
}

async function readFiles(dirnames) {
    if(!dirnames){
        return [];
    }
    const directories = dirnames.split(',');
    let testsBySize = [];

    await Promise.all(directories.map(async (dirname) =>{
        dirname = dirname.trim();
        const classes = await fs.readdir(dirname);
        const testClasses = classes.filter(className => className.endsWith('.cls') && className.toLowerCase().includes('test') && !className.toLowerCase().includes('factory'));
        await Promise.all(testClasses.map(async function (testName) {
            const className = testName.split('.').shift();
            const fileStat = await fs.stat(dirname+testName);
            testsBySize[className] = fileStat.size;
        }));
    }));

    // testsBySize = Object.entries(testsBySize)
    // .sort(([,a],[,b]) => a-b)
    // .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});

    // await fs.writeFile('output3.json', JSON.stringify(testsBySize));  

    return testsBySize;
}

function chunks(tests, limit){
    let testChunks = [];
    let miniChunks = [];
    let testSize = 0;
    tests.forEach((test, index) => {
        if(testChunks.length == batchSize-1){
            const testData = tests.splice(index-1);
            testChunks.push(testData.map(tes => tes.className));
            return testChunks;
        }else if(test.size >= limit){
            testChunks.push([test.className]);
        }else{
            testSize += test.size;
            if(testSize >= limit){
                testChunks.push(miniChunks);
                miniChunks = [test.className];
                testSize=test.size;
            }else{
                miniChunks.push(test.className);
            }
        }
    });

    // divide tests in half
    // let middleIndex = Math.ceil(tests.length / batchSize);
    // let startingIndex = 0;
    // for(let i = 0; i < batchSize; i++) {
    //     testChunks[i] = tests.slice(startingIndex, middleIndex).map(tes => tes.className);
    //     startingIndex = middleIndex
    //     middleIndex += startingIndex;
    // }
    return testChunks;
}
